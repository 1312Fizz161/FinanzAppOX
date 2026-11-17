-- Einmalig im Supabase-Dashboard ausführen: SQL Editor → New query → einfügen → Run.
-- Legt die Tabelle an, in der der ganze Stand der App liegt (eine Zeile, id = 'main').

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Die eine Zeile anlegen (die App aktualisiert sie nur, sie legt sie nicht an)
insert into public.app_state (id, data) values ('main', '{}'::jsonb)
  on conflict (id) do nothing;

-- Nur angemeldete Personen dürfen die Zeile lesen und ändern
alter table public.app_state enable row level security;

drop policy if exists "angemeldet lesen" on public.app_state;
create policy "angemeldet lesen" on public.app_state
  for select to authenticated
  using (id = 'main');

drop policy if exists "angemeldet ändern" on public.app_state;
create policy "angemeldet ändern" on public.app_state
  for update to authenticated
  using (id = 'main')
  with check (id = 'main');

-- Live-Updates: Änderungen erreichen die offenen Geräte sofort
do $$
begin
  alter publication supabase_realtime add table public.app_state;
exception when duplicate_object then
  null; -- schon eingetragen
end $$;
