-- Skillet: Kochtagebuch – jedes Mal, wenn gekocht wurde (nach Rezept oder frei). Angelegt am 9.11.2026.
create table if not exists public.kochtagebuch (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid references public.recipes(id) on delete set null,
  titel       text not null,                       -- Stand beim Kochen; bleibt, auch wenn das Rezept weg ist
  frei        boolean not null default false,      -- frei gekocht (ohne Rezept)
  gekocht_am  timestamptz not null default now(),
  bewertung   text check (bewertung in ('gern', 'geht_so', 'nein')),
  notiz       text                                 -- "Was war anders / nächstes Mal anders?"
);
create index if not exists kochtagebuch_rezept_idx on public.kochtagebuch (recipe_id, gekocht_am desc);

alter table public.kochtagebuch enable row level security;
drop policy if exists "Allow read for anon" on public.kochtagebuch;
create policy "Allow read for anon" on public.kochtagebuch for select to anon, authenticated using (true);
drop policy if exists "Allow insert for anon" on public.kochtagebuch;
create policy "Allow insert for anon" on public.kochtagebuch for insert to anon, authenticated with check (true);
drop policy if exists "Allow update for anon" on public.kochtagebuch;
create policy "Allow update for anon" on public.kochtagebuch for update to anon, authenticated using (true) with check (true);
drop policy if exists "Allow delete for anon" on public.kochtagebuch;
create policy "Allow delete for anon" on public.kochtagebuch for delete to anon, authenticated using (true);
