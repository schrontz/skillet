const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXTRACTION_SYSTEM_PROMPT = `Du extrahierst Rezept-Informationen aus dem rohen Textinhalt einer Webseite.

Finde: Titel des Rezepts, Zutatenliste, Zubereitungsanleitung, Anzahl Portionen (falls angegeben).

WICHTIG: Erfinde NICHTS. Falls der Text kein erkennbares Rezept enthält, oder
wesentliche Teile (Zutaten ODER Anleitung) fehlen, setze "erfolgreich": false und
lass die entsprechenden Felder leer, statt zu raten oder mit allgemeinem Kochwissen
aufzufüllen. Falls keine Portionsangabe im Text zu finden ist, setze "basisPortionen"
auf null - rate NICHT.

"zutaten": zusammenhängender, gut lesbarer Freitext (nicht als Array), ähnlich wie ein
Mensch es abtippen würde - Mengenangaben beibehalten, wenn im Text vorhanden.

"zutatenStrukturiert": dieselben Zutaten zusätzlich als Array einzelner Objekte
{"menge": Zahl oder null, "einheit": "string oder null", "name": "string"} - eine
Zutat pro Zeile aus dem Originaltext. "menge" nur setzen, wenn im Text eine konkrete
Zahl stand, sonst null (z. B. bei "Salz nach Geschmack").

Antworte AUSSCHLIESSLICH mit validem JSON in genau diesem Format, ohne Markdown-
Codeblock, ohne einleitenden oder abschließenden Text:

{
  "erfolgreich": true oder false,
  "titel": "string",
  "zutaten": "string",
  "zutatenStrukturiert": [{"menge": null, "einheit": null, "name": "string"}],
  "anleitung": "string",
  "basisPortionen": null
}`;

function extractInstructionsText(raw: any, numberSteps = true): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;

  const items = Array.isArray(raw) ? raw : [raw];
  const hasSections = items.some((i: any) => i && typeof i === "object" && i.itemListElement);
  const lines: string[] = [];

  if (hasSections) {
    for (const item of items) {
      if (typeof item === "string") {
        lines.push(item);
      } else if (item.itemListElement) {
        if (item.name) lines.push(`${item.name}:`);
        lines.push(extractInstructionsText(item.itemListElement, true));
      } else if (item.text) {
        lines.push(item.text);
      }
    }
  } else {
    const stepTexts = items.map((item: any) => (typeof item === "string" ? item : item.text || "")).filter(Boolean);
    if (numberSteps && stepTexts.length > 1) {
      stepTexts.forEach((t: string, idx: number) => lines.push(`${idx + 1}. ${t}`));
    } else {
      lines.push(...stepTexts);
    }
  }

  return lines.filter(Boolean).join("\n");
}

const BEKANNTE_EINHEITEN = [
  "g", "kg", "ml", "l", "el", "tl", "prise", "prisen", "bund", "stück", "stk",
  "dose", "dosen", "päckchen", "schuss", "tasse", "tassen", "zehe", "zehen",
  "scheibe", "scheiben", "blatt", "blätter", "würfel", "msp"
];

function parseZutatenZeile(zeile: string) {
  const trimmed = zeile.trim();
  const match = trimmed.match(/^(\d+[.,]?\d*(?:\/\d+)?)\s*([a-zäöüß.()]*)?\s*(.*)$/i);

  if (!match || !match[1]) {
    return { menge: null, einheit: null, name: trimmed };
  }

  let menge = match[1].replace(",", ".");
  if (menge.includes("/")) {
    const [z, n] = menge.split("/").map(Number);
    menge = n ? String(z / n) : menge;
  }
  const moeglicheEinheit = (match[2] || "").replace(/[().]/g, "").toLowerCase();
  const rest = match[3]?.trim() || "";

  if (BEKANNTE_EINHEITEN.includes(moeglicheEinheit)) {
    return { menge: parseFloat(menge), einheit: match[2].trim(), name: rest };
  }
  return { menge: parseFloat(menge), einheit: null, name: `${match[2] || ""} ${rest}`.trim() };
}

function parsePortionen(recipeYield: any): number | null {
  if (!recipeYield) return null;
  const raw = Array.isArray(recipeYield) ? recipeYield[0] : recipeYield;
  const match = String(raw).match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function extractStructuredRecipe(html: string) {
  const scriptMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const match of scriptMatches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const flat = candidates.flatMap((c: any) => (c["@graph"] ? c["@graph"] : [c]));

      const recipe = flat.find((item: any) => {
        const type = item["@type"];
        return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
      });

      if (recipe) {
        const titel = recipe.name || "";

        const zutatenArray = recipe.recipeIngredient || recipe.ingredients || [];
        const zutatenZeilen: string[] = Array.isArray(zutatenArray) ? zutatenArray : [String(zutatenArray)];
        const zutaten = zutatenZeilen.join("\n");
        const zutatenStrukturiert = zutatenZeilen.map(parseZutatenZeile);

        const anleitung = extractInstructionsText(recipe.recipeInstructions);
        const basisPortionen = parsePortionen(recipe.recipeYield);

        if (titel && (zutaten || anleitung)) {
          return { titel, zutaten, anleitung, zutatenStrukturiert, basisPortionen };
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

function htmlToPlainText(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const text = withoutScripts.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 15000);
}

async function extractWithAI(html: string) {
  const plainText = htmlToPlainText(html);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: plainText }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    }
  );
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Keine gültige Antwort von Gemini: " + JSON.stringify(data));
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "Keine URL übergeben" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Realistischer Browser-User-Agent statt selbstidentifizierender Bot-Kennung -
    // manche Seiten (z. B. Chefkoch) blocken erkennbare Scraper-Anfragen
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });
    if (!pageRes.ok) {
      return new Response(JSON.stringify({ error: `Seite konnte nicht geladen werden (Status ${pageRes.status})` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const html = await pageRes.text();

    const structured = extractStructuredRecipe(html);
    if (structured) {
      return new Response(JSON.stringify({ source: "structured", ...structured }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await extractWithAI(html);
    if (!aiResult.erfolgreich) {
      return new Response(JSON.stringify({ error: "Kein Rezept auf dieser Seite erkannt" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        source: "ai",
        titel: aiResult.titel,
        zutaten: aiResult.zutaten,
        zutatenStrukturiert: aiResult.zutatenStrukturiert || [],
        anleitung: aiResult.anleitung,
        basisPortionen: aiResult.basisPortionen ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
