// Teil von Skillet - siehe index.html für die anderen Module (shared.js, recipes.js, reflect.js, progress-history.js, init.js)

  let progressCache = [];

  async function loadProgress() {
    const listEl = document.getElementById('progress-list');
    listEl.innerHTML = `<div class="muted">Lade Fortschritt...</div>`;

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/techniques?select=id,name,kurzbeschreibung,kernkriterien,typische_fehler,root_kategorie,technique_progress(level,angewendet_count,sauber_bestaetigt_count)&order=name.asc`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    );
    const data = await res.json();
    progressCache = data;

    listEl.innerHTML = data.map((t, idx) => {
      const p = (t.technique_progress && t.technique_progress[0]) || { level: 0, angewendet_count: 0, sauber_bestaetigt_count: 0 };
      const dots = [0, 1, 2, 3].map(i => `<span class="dot ${i <= p.level ? 'filled' : ''}"></span>`).join('');
      return `
        <div class="progress-item" style="align-items:flex-start; flex-direction:column; cursor:pointer;" onclick="toggleProgressDetail(${idx})">
          <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
            <div>
              <div>${t.name}</div>
              <div class="muted">${p.sauber_bestaetigt_count}x sauber bestätigt · ${p.angewendet_count}x angewendet</div>
            </div>
            <div class="level-dots">${dots}</div>
          </div>
          <div id="progress-detail-${idx}" style="display:none; width:100%; margin-top:10px;"></div>
        </div>
      `;
    }).join('');
  }

  function toggleProgressDetail(idx) {
    const el = document.getElementById(`progress-detail-${idx}`);
    const isOpen = el.style.display === 'block';
    document.querySelectorAll('[id^="progress-detail-"]').forEach(e => e.style.display = 'none');
    if (isOpen) return;
    el.innerHTML = `<div style="border-top:1px solid var(--border); padding-top:10px;">${steckbriefHtml(progressCache[idx])}</div>`;
    el.style.display = 'block';
  }

  // ---- Verlauf: alle abgeschlossenen Reflexionen chronologisch ----
  let historyCache = [];

  async function loadHistory() {
    const listEl = document.getElementById('history-list');
    listEl.innerHTML = `<div class="muted">Lade Verlauf...</div>`;

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/reflections?select=id,ergebnis,finaler_output,erstellt_am,techniques(name),recipes(titel)&finaler_output=not.is.null&order=erstellt_am.desc&limit=50`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    );
    const data = await res.json();
    historyCache = data;

    if (!data.length) {
      listEl.innerHTML = `<div class="muted">Noch keine abgeschlossenen Reflexionen.</div>`;
      return;
    }

    const labels = {
      sauber_bestaetigt: "✅ Sauber bestätigt",
      unklar_geblieben: "❔ Unklar geblieben",
      fehler_erkannt: "⚠️ Fehler erkannt",
      technischer_fehler: "⚠️ Technischer Fehler"
    };

    listEl.innerHTML = data.map((r, i) => {
      const datum = new Date(r.erstellt_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `
        <div class="progress-item" style="align-items:flex-start; flex-direction:column; cursor:pointer;" onclick="toggleHistoryDetail(${i})">
          <div style="display:flex; justify-content:space-between; width:100%;">
            <div style="font-weight:600;">${r.techniques?.name || '(gelöschte Technik)'}</div>
            <div class="muted" style="font-size:0.8rem;">${datum}</div>
          </div>
          ${r.recipes?.titel ? `<div class="muted" style="font-size:0.85rem;">${r.recipes.titel}</div>` : ''}
          <div style="font-size:0.85rem; margin-top:4px;">${labels[r.ergebnis] || r.ergebnis || ''}</div>
          <div id="history-detail-${i}" style="display:none; width:100%; margin-top:10px;"></div>
        </div>
      `;
    }).join('');
  }

  function toggleHistoryDetail(i) {
    const el = document.getElementById(`history-detail-${i}`);
    const isOpen = el.style.display === 'block';
    document.querySelectorAll('[id^="history-detail-"]').forEach(e => e.style.display = 'none');
    if (isOpen) return;

    const output = historyCache[i].finaler_output;
    let html = `<div style="border-top:1px solid var(--border); padding-top:10px;">`;
    if (output.kriterien_bewertung && output.kriterien_bewertung.length > 0) {
      html += output.kriterien_bewertung.map(k => `
        <div class="kriterium"><span>${k.kriterium}</span><span class="badge ${k.status}">${k.status.replace('_',' ')}</span></div>
      `).join('');
    }
    if (output.fehler_erkannt && output.fehler_erkannt.length > 0) {
      html += `<div class="fehler-liste">${output.fehler_erkannt.join(' ')}</div>`;
    }
    if (output.gesamteinschaetzung) {
      html += `<p style="margin-top:10px; font-size:0.9rem;">${output.gesamteinschaetzung}</p>`;
    }
    html += `</div>`;
    el.innerHTML = html;
    el.style.display = 'block';
  }
