-- ════════════════════════════════════════════════════════════════════
-- Editable website text (admins change wording from the site)
-- Already included at the end of schema.sql. Run THIS file only if you set
-- up your project with an older schema.sql. Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════

create table if not exists site_content (
  key text primary key check (key ~ '^[\w.]{1,100}$'),
  value text not null check (char_length(value) between 1 and 5000),
  updated_by uuid references profiles,
  updated_at timestamptz not null default now()
);

alter table site_content enable row level security;
drop policy if exists "public read" on site_content;
create policy "public read" on site_content for select using (true);

-- p_value = null → remove the override (back to the default wording)
create or replace function set_content(p_key text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['admin']::app_role[]);
  if p_key !~ '^[\w.]{1,100}$' then raise exception 'Invalid text key.'; end if;
  if p_value is null then
    delete from site_content where key = p_key;
    perform _audit('content.edit', format('Reset text "%s" to default', p_key));
  else
    if char_length(btrim(p_value)) = 0 or char_length(p_value) > 5000 then raise exception 'Text must be 1–5000 characters.'; end if;
    insert into site_content(key, value, updated_by) values (p_key, p_value, auth.uid())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
    perform _audit('content.edit', format('Edited text "%s"', p_key));
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'site_content') then
    alter publication supabase_realtime add table site_content;
  end if;
end $$;
