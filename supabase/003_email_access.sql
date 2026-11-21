-- ════════════════════════════════════════════════════════════════════
-- Email sign-in + staff access by email
--   • Admins invite staff by email and choose their roles.
--   • Roles are applied the moment that person signs in with that email
--     (or immediately, if they already have an account).
--   • Emails stay private: only admins can see invites and the staff list.
-- Already included at the end of schema.sql. Run THIS file only if your
-- project was set up with an older schema.sql. Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════

create table if not exists role_invites (
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role app_role not null check (role in ('admin','supervisor','hoster','cheat_checker','counter','commentator')),
  invited_by uuid references profiles,
  created_at timestamptz not null default now(),
  primary key (email, role)
);
alter table role_invites enable row level security;
drop policy if exists "admin read" on role_invites;
create policy "admin read" on role_invites for select using (has_role('admin'));

-- New account (Discord or email) → profile, viewer role, invited staff roles
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text;
begin
  d := regexp_replace(coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'user_name',
                               split_part(coalesce(new.email, ''), '@', 1), 'player'), '#0$', '');
  insert into profiles(id, discord, display_name, avatar_url)
  values (new.id, d,
          coalesce(new.raw_user_meta_data->'custom_claims'->>'global_name', new.raw_user_meta_data->>'full_name', d),
          new.raw_user_meta_data->>'avatar_url');
  insert into user_roles(user_id, role) values (new.id, 'viewer') on conflict do nothing;
  insert into user_roles(user_id, role)
    select new.id, role from role_invites where email = lower(coalesce(new.email, ''))
    on conflict do nothing;
  update players set user_id = new.id where user_id is null and lower(discord) = lower(d);
  return new;
end $$;

-- Invite (or update) a staff member by email. Returns 'applied' if they already
-- have an account (roles active now) or 'pending' (active on first sign-in).
create or replace function invite_staff(p_email text, p_roles text[]) returns text
language plpgsql security definer set search_path = public, auth as $$
declare e text := lower(btrim(coalesce(p_email, ''))); uid uuid; staff app_role[] := array['admin','supervisor','hoster','cheat_checker','counter','commentator']::app_role[];
begin
  perform require_role(array['admin']::app_role[]);
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.'; end if;
  if cardinality(coalesce(p_roles, '{}')) = 0 then raise exception 'Choose at least one role.'; end if;
  if exists (select 1 from unnest(p_roles) r where r not in ('admin','supervisor','hoster','cheat_checker','counter','commentator')) then
    raise exception 'Invalid staff role.'; end if;
  select id into uid from auth.users where lower(email) = e limit 1;
  if uid = auth.uid() and not ('admin' = any(p_roles)) then raise exception 'You cannot remove your own admin role.'; end if;

  delete from role_invites where email = e;
  insert into role_invites(email, role, invited_by) select e, r::app_role, auth.uid() from unnest(p_roles) r on conflict do nothing;

  if uid is not null then
    delete from user_roles where user_id = uid and role = any(staff);
    insert into user_roles(user_id, role) select uid, r::app_role from unnest(p_roles) r on conflict do nothing;
    perform _audit('staff.invite', format('Staff access for %s: %s (active now)', e, array_to_string(p_roles, ', ')));
    return 'applied';
  end if;
  perform _audit('staff.invite', format('Staff invite for %s: %s (on first sign-in)', e, array_to_string(p_roles, ', ')));
  return 'pending';
end $$;

-- Remove all staff access for an email (keeps their normal viewer/captain account)
create or replace function remove_staff(p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare e text := lower(btrim(coalesce(p_email, ''))); uid uuid;
begin
  perform require_role(array['admin']::app_role[]);
  select id into uid from auth.users where lower(email) = e limit 1;
  if uid = auth.uid() then raise exception 'You cannot remove your own access.'; end if;
  delete from role_invites where email = e;
  if uid is not null then
    delete from user_roles where user_id = uid and role in ('admin','supervisor','hoster','cheat_checker','counter','commentator');
  end if;
  perform _audit('staff.remove', format('Removed staff access for %s', e));
end $$;

-- Admin-only staff directory with private emails (never exposed publicly)
create or replace function staff_directory() returns table (email text, user_id uuid, display_name text, roles text[], signed_up boolean)
language plpgsql stable security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  perform require_role(array['admin']::app_role[]);
  return query
    with staff_users as (
      select u.id, lower(u.email) as email from auth.users u
      where u.email is not null
        and exists (select 1 from user_roles r where r.user_id = u.id and r.role in ('admin','supervisor','hoster','cheat_checker','counter','commentator'))
    ),
    emails as (
      select email from staff_users union select email from role_invites
    )
    select em.email,
           su.id,
           p.display_name,
           coalesce(
             (select array_agg(r.role::text order by r.role) from user_roles r where r.user_id = su.id and r.role <> 'viewer' and r.role <> 'captain'),
             (select array_agg(i.role::text order by i.role) from role_invites i where i.email = em.email)
           ),
           su.id is not null
    from emails em
    left join staff_users su on su.email = em.email
    left join profiles p on p.id = su.id
    order by em.email;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'role_invites') then
    alter publication supabase_realtime add table role_invites;
  end if;
end $$;
