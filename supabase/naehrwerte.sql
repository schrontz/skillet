-- Skillet: Nährwerte aus dem Bundeslebensmittelschlüssel (BLS 4.0, Max Rubner-Institut)
-- Die Daten selbst (7.140 Lebensmittel) werden getrennt eingespielt, siehe claude/bls/README.md.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- Nährwerte je 100 g, nur die Spalten, die Skillet braucht
create table if not exists public.bls_lebensmittel (
  code      text primary key,          -- BLS-Code, z. B. G480100
  name      text not null,             -- "Speisezwiebel roh"
  name_en   text,
  kcal      numeric not null,
  eiweiss   numeric not null,
  fett      numeric not null,
  kh        numeric not null,          -- Kohlenhydrate, verfügbar
  ballast   numeric,
  zucker    numeric,
  ges_fett  numeric,
  salz      numeric,
  -- X/Y sind fertige Gerichte ("Zwiebeln gebraten", "Pilaw") - für Zutaten meist die falsche Wahl
  gericht   boolean generated always as (left(code, 1) in ('X', 'Y')) stored
);
create index if not exists bls_name_trgm on public.bls_lebensmittel using gin (lower(name) extensions.gin_trgm_ops);

-- Was Skillet über eine Zutat gelernt hat: welcher BLS-Eintrag und wie viel Gramm eine Einheit wiegt.
-- Einmal zugeordnet, rechnet Skillet beim nächsten Mal ohne KI.
create table if not exists public.zutat_wissen (
  name_norm          text not null,           -- "zwiebeln"
  einheit_norm       text not null default '', -- "" (Stück), "dose", "el", "g" ...
  bls_code           text references public.bls_lebensmittel(code),
  gramm_pro_einheit  numeric,                 -- 1 Zwiebel = 100; bei "g" immer 1
  annahme            text,                    -- "1 mittelgroße Zwiebel ≈ 100 g"
  unsicher           boolean not null default false,
  quelle             text not null default 'ki' check (quelle in ('ki', 'hand')),
  aktualisiert_am    timestamptz not null default now(),
  primary key (name_norm, einheit_norm)
);

alter table public.recipes add column if not exists naehrwerte jsonb;

-- Kandidaten für eine Zutat: unscharfe Suche, rohe Lebensmittel vor Gerichten
create or replace function public.bls_kandidaten(suche text, anzahl int default 12)
returns table (code text, name text, kcal numeric, score real)
language sql stable
set search_path = public, extensions
as $$
  select b.code, b.name, b.kcal,
         (greatest(word_similarity(lower(suche), lower(b.name)), similarity(lower(suche), lower(b.name)))
          + case when b.name ilike '%roh%' then 0.03 else 0 end
          - case when b.gericht then 0.15 else 0 end)::real as score
  from public.bls_lebensmittel b
  where lower(suche) <% lower(b.name) or similarity(lower(suche), lower(b.name)) > 0.2
  order by score desc, length(b.name)
  limit anzahl;
$$;

alter table public.bls_lebensmittel enable row level security;
alter table public.zutat_wissen enable row level security;
drop policy if exists "Allow read for anon" on public.bls_lebensmittel;
create policy "Allow read for anon" on public.bls_lebensmittel for select to anon, authenticated using (true);
drop policy if exists "Allow read for anon" on public.zutat_wissen;
create policy "Allow read for anon" on public.zutat_wissen for select to anon, authenticated using (true);
drop policy if exists "Allow insert for anon" on public.zutat_wissen;
create policy "Allow insert for anon" on public.zutat_wissen for insert to anon, authenticated with check (true);
drop policy if exists "Allow update for anon" on public.zutat_wissen;
create policy "Allow update for anon" on public.zutat_wissen for update to anon, authenticated using (true) with check (true);
