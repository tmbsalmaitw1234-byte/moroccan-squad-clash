-- ════════════════════════════════════════════════════════════════════
-- FREE FIRE: MOROCCAN SQUAD CLASH — Supabase / Postgres schema (v2)
-- ════════════════════════════════════════════════════════════════════
-- Run once in the Supabase SQL editor on a NEW project.
--
-- Security model
--   • Row Level Security on every table. Clients may only SELECT.
--   • Every write goes through a SECURITY DEFINER function below that
--     checks the caller's role (auth.uid() → user_roles) and validates input.
--   • DHD balances are the SUM of an append-only ledger. No one, including
--     staff, can type a balance. Every ledger row has a unique idem_key, so
--     payouts and double-clicks can never be applied twice.
--   • Result verification, victory bonus and prediction settlement happen in
--     ONE transaction (verify_result).
--   • Room credentials live in match_rooms, readable only by the two squads'
--     members and staff with room access.
-- ════════════════════════════════════════════════════════════════════

-- ───────── Types ─────────
create type app_role as enum ('viewer','captain','commentator','hoster','cheat_checker','counter','supervisor','admin');
create type squad_status as enum ('pending','approved','rejected');
create type match_stage as enum ('group','tiebreak','qf','sf','final');
create type match_status as enum ('upcoming','ready','live','review','completed','cancelled');
create type prediction_status as enum ('open','won','lost','refunded');
create type tx_kind as enum ('grant','stake','payout','refund');
create type report_status as enum ('submitted','checker_review','investigation','decided','announced','dismissed');
create type penalty_type as enum ('warning','match_dq','tournament_dq');

-- ───────── Tables ─────────
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  discord text not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table user_roles (
  user_id uuid references profiles on delete cascade,
  role app_role not null,
  primary key (user_id, role)
);

create table settings (
  id int primary key default 1 check (id = 1),
  min_stake int not null default 10,
  max_stake int not null default 500,
  starting_balance int not null default 1000,
  victory_reward int not null default 200,
  enforce_registration_window boolean not null default true,
  registration_opens timestamptz not null default '2026-11-22T00:00:00+01:00',
  registration_closes timestamptz not null default '2026-11-24T23:59:59+01:00',
  sniper_rule_enabled boolean not null default true,
  sniper_rule_confirmed boolean not null default false,
  sniper_rule_text text not null default 'One sniper setup requires two registered sniper players. If a second sniper is present in the same squad, only one sniper may be used at a time.',
  max_laptops int not null default 2,
  draw_done boolean not null default false,
  groups_locked boolean not null default false,
  match_of_day uuid,
  champion_squad uuid,
  champion_declared_at timestamptz,
  champion_paid boolean not null default false,
  top_killer_paid boolean not null default false
);
insert into settings default values;

create table squads (
  id uuid primary key default gen_random_uuid(),
  number int unique check (number between 1 and 16),
  name text not null check (char_length(name) between 3 and 28),
  tag text not null check (char_length(tag) between 2 and 4),
  color text not null default '#c1272d',
  logo_url text check (logo_url is null or length(logo_url) <= 300000),
  captain_discord text not null,
  owner_id uuid not null references profiles,
  status squad_status not null default 'pending',
  reject_reason text,
  disqualified boolean not null default false,
  group_id text check (group_id in ('A','B','C','D')),
  group_slot int check (group_slot between 0 and 3),
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references squads on delete cascade,
  user_id uuid references profiles,
  discord text not null,
  ff_username text not null,
  ff_uid text not null check (ff_uid ~ '^\d{8,12}$'),
  ign text not null,
  role text not null,
  slot text not null check (slot in ('starter','sub')),
  is_captain boolean not null default false,
  position int not null default 0
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  number int unique not null,
  label text not null,
  stage match_stage not null,
  group_id text,
  day int not null,
  starts_at timestamptz not null,
  src_a jsonb not null default '{"type":"fixed"}',
  src_b jsonb not null default '{"type":"fixed"}',
  squad_a uuid references squads,
  squad_b uuid references squads,
  map text not null default 'Bermuda',
  status match_status not null default 'upcoming',
  ready_a boolean not null default false,
  ready_b boolean not null default false,
  commentator_id uuid references profiles,
  supervisor_id uuid references profiles,
  predictions_open boolean not null default true,
  pending_winner uuid references squads,
  pending_by uuid references profiles,
  pending_at timestamptz,
  winner uuid references squads,
  mvp_player uuid references players,
  settled boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  highlights text[] not null default '{}'
);

create table match_rooms (
  match_id uuid primary key references matches on delete cascade,
  room_id text not null,
  room_password text not null,
  created_by uuid not null references profiles,
  created_at timestamptz not null default now()
);

create table match_kills (
  match_id uuid references matches on delete cascade,
  player_id uuid references players,
  kills int not null check (kills between 0 and 60),
  verified boolean not null default false,
  primary key (match_id, player_id)
);

create table match_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references matches on delete cascade,
  author_id uuid references profiles,
  kind text not null,
  body text not null check (char_length(body) between 1 and 400),
  created_at timestamptz not null default now()
);

create table chat_messages (
  id bigint generated always as identity primary key,
  match_id uuid not null references matches on delete cascade,
  user_id uuid not null references profiles,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);

create table dhd_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles,
  amount int not null,
  kind tx_kind not null,
  ref text not null,
  memo text not null,
  idem_key text not null unique,
  created_at timestamptz not null default now()
);

create view dhd_balances with (security_invoker = true) as
  select user_id, coalesce(sum(amount), 0)::int as balance from dhd_ledger group by user_id;

create table predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles,
  match_id uuid not null references matches,
  pick uuid not null references squads,
  stake int not null check (stake > 0),
  status prediction_status not null default 'open',
  payout int not null default 0,
  created_at timestamptz not null default now()
);
create unique index one_prediction_per_match on predictions (user_id, match_id) where status <> 'refunded';

create table squad_rewards (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references squads,
  match_id uuid not null unique references matches,
  amount int not null,
  status text not null default 'pending' check (status in ('pending','paid')),
  paid_at timestamptz
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles,
  target text not null,
  target_squad uuid references squads,
  ff_uid text,
  match_number int,
  occurred_at timestamptz not null,
  category text not null,
  explanation text not null,
  evidence_url text not null check (length(evidence_url) <= 400000),
  status report_status not null default 'submitted',
  checker_id uuid references profiles,
  checker_notes text,
  decision text,
  penalty text,
  decided_by uuid references profiles,
  created_at timestamptz not null default now()
);

create table penalties (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references squads,
  type penalty_type not null,
  reason text not null,
  report_id uuid references reports,
  issued_by uuid not null references profiles,
  created_at timestamptz not null default now()
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  body text not null,
  author_id uuid not null references profiles,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

-- ════════════════ Helpers ════════════════

create or replace function has_role(r app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = r)
$$;

create or replace function has_any_role(rs app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = any(rs))
$$;

create or replace function require_user() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in with Discord first.'; end if;
  return auth.uid();
end $$;

create or replace function require_role(rs app_role[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_user();
  if not has_any_role(rs) then raise exception 'Permission denied for your role.'; end if;
end $$;

-- Squads the caller belongs to (security definer avoids recursive RLS on players)
create or replace function my_squad_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select squad_id from players where user_id = auth.uid()
  union select id from squads where owner_id = auth.uid() and status <> 'rejected'
$$;

create or replace function _audit(a text, d text) returns void
language sql security definer set search_path = public as $$
  insert into audit_log(actor_id, action, detail) values (auth.uid(), a, d)
$$;

create or replace function _event(p_match uuid, p_kind text, p_body text, p_author uuid) returns void
language sql security definer set search_path = public as $$
  insert into match_events(match_id, kind, body, author_id) values (p_match, p_kind, p_body, p_author)
$$;

create or replace function _refund(p_pred uuid, p_memo text) returns void
language plpgsql security definer set search_path = public as $$
declare p predictions;
begin
  update predictions set status = 'refunded' where id = p_pred and status = 'open' returning * into p;
  if found then
    insert into dhd_ledger(user_id, amount, kind, ref, memo, idem_key)
    values (p.user_id, p.stake, 'refund', p.id::text, p_memo, 'refund:' || p.id)
    on conflict (idem_key) do nothing;
  end if;
end $$;

create or replace function _penalty(p_squad uuid, p_type text, p_reason text, p_report uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from squads where id = p_squad) then raise exception 'Squad not found'; end if;
  insert into penalties(squad_id, type, reason, report_id, issued_by) values (p_squad, p_type::penalty_type, p_reason, p_report, auth.uid());
  if p_type = 'tournament_dq' then update squads set disqualified = true where id = p_squad; end if;
  perform _audit('penalty.issue', format('%s → %s: %s', p_type, p_squad, p_reason));
end $$;

-- Internal helpers must not be callable from the API
revoke execute on function _audit(text, text) from public, anon, authenticated;
revoke execute on function _event(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function _refund(uuid, text) from public, anon, authenticated;
revoke execute on function _penalty(uuid, text, text, uuid) from public, anon, authenticated;

-- ───────── New user → profile + viewer role ─────────
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
  -- link any registered player rows that used this Discord username
  update players set user_id = new.id where user_id is null and lower(discord) = lower(d);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ════════════════ Row Level Security ════════════════
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table settings enable row level security;
alter table squads enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table match_rooms enable row level security;
alter table match_kills enable row level security;
alter table match_events enable row level security;
alter table chat_messages enable row level security;
alter table dhd_ledger enable row level security;
alter table predictions enable row level security;
alter table squad_rewards enable row level security;
alter table reports enable row level security;
alter table penalties enable row level security;
alter table announcements enable row level security;
alter table audit_log enable row level security;

create policy "public read" on profiles for select using (true);
create policy "public read" on user_roles for select using (true);
create policy "public read" on settings for select using (true);
create policy "public read" on squads for select using (true);
create policy "public read" on matches for select using (true);
create policy "public read" on match_events for select using (true);
create policy "public read" on chat_messages for select using (true);
create policy "public read" on predictions for select using (true);   -- transparent pools
create policy "public read" on squad_rewards for select using (true);
create policy "public read" on penalties for select using (true);
create policy "public read" on announcements for select using (true);

create policy "verified kills" on match_kills for select
  using (verified or has_any_role(array['counter','supervisor','admin']::app_role[]));

create policy "staff or own squad" on players for select using (
  has_any_role(array['admin','supervisor','cheat_checker','counter','hoster']::app_role[])
  or squad_id in (select my_squad_ids())
);

-- Public roster with masked UIDs (view runs as owner → bypasses players RLS on purpose)
create view players_public as
  select id, squad_id, user_id, discord, ff_username, ign, role, slot, is_captain, position,
         left(ff_uid, 3) || '••••' || right(ff_uid, 2) as ff_uid
  from players;

create policy "room access" on match_rooms for select using (
  has_any_role(array['admin','supervisor','hoster','counter','cheat_checker']::app_role[])
  or exists (
    select 1 from matches m
    where m.id = match_rooms.match_id
      and (m.squad_a in (select my_squad_ids()) or m.squad_b in (select my_squad_ids()))
  )
);

create policy "own ledger" on dhd_ledger for select using (user_id = auth.uid() or has_role('admin'));
create policy "reports read" on reports for select
  using (reporter_id = auth.uid() or has_any_role(array['cheat_checker','supervisor','admin']::app_role[]));
create policy "audit read" on audit_log for select using (has_any_role(array['admin','supervisor']::app_role[]));
-- No INSERT/UPDATE/DELETE policies anywhere: all writes go through the functions below.

-- ════════════════ Wallet ════════════════

create or replace function ensure_wallet() returns int
language plpgsql security definer set search_path = public as $$
declare u uuid := require_user(); bal int;
begin
  insert into dhd_ledger(user_id, amount, kind, ref, memo, idem_key)
  select u, s.starting_balance, 'grant', 'welcome', 'Welcome grant', 'grant:' || u from settings s
  on conflict (idem_key) do nothing;
  select coalesce(sum(amount), 0) into bal from dhd_ledger where user_id = u;
  return bal;
end $$;

-- ════════════════ Registration ════════════════

create or replace function register_squad(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u uuid := require_user(); s settings; sid uuid; pl jsonb; i int := 0;
  nm text := btrim(coalesce(p->>'name', '')); tg text := upper(btrim(coalesce(p->>'tag', '')));
  starters int; subs int; caps int; dup text;
begin
  select * into s from settings;
  if s.enforce_registration_window and (now() < s.registration_opens or now() > s.registration_closes) then
    raise exception 'Registration is closed (Nov 22–24, 2026).'; end if;
  if s.groups_locked then raise exception 'Groups are locked — registration is closed.'; end if;
  if not coalesce((p->>'rulesAccepted')::boolean, false) then raise exception 'All members must confirm they have read the rules.'; end if;
  if char_length(nm) not between 3 and 28 then raise exception 'Squad name must be 3–28 characters.'; end if;
  if exists (select 1 from squads where status <> 'rejected' and lower(name) = lower(nm)) then raise exception 'Squad name already taken.'; end if;
  if (select count(*) from squads where status = 'approved') >= 16 then raise exception 'All 16 squad slots are filled.'; end if;
  if exists (select 1 from squads where owner_id = u and status <> 'rejected') then raise exception 'You already have an active registration.'; end if;
  if jsonb_typeof(p->'players') <> 'array' or jsonb_array_length(p->'players') <> 4 then raise exception 'Exactly 4 players required.'; end if;

  select count(*) filter (where e->>'slot' = 'starter'), count(*) filter (where e->>'slot' = 'sub'),
         count(*) filter (where coalesce((e->>'isCaptain')::boolean, false))
    into starters, subs, caps from jsonb_array_elements(p->'players') e;
  if starters <> 3 then raise exception 'Exactly 3 starters required.'; end if;
  if subs <> 1 then raise exception 'Exactly 1 substitute required.'; end if;
  if caps <> 1 then raise exception 'Select exactly one captain.'; end if;

  for pl in select * from jsonb_array_elements(p->'players') loop
    if coalesce(pl->>'uid', '') !~ '^\d{8,12}$' then raise exception 'Invalid Free Fire UID "%" — 8–12 digits.', pl->>'uid'; end if;
    if btrim(coalesce(pl->>'discord', '')) = '' or btrim(coalesce(pl->>'ffUsername', '')) = '' or btrim(coalesce(pl->>'ign', '')) = '' then
      raise exception 'All player fields are required.'; end if;
  end loop;
  if (select count(distinct e->>'uid') from jsonb_array_elements(p->'players') e) <> 4 then raise exception 'Duplicate UID inside your squad.'; end if;
  select pp.ff_uid into dup from players pp join squads q on q.id = pp.squad_id
   where q.status <> 'rejected' and pp.ff_uid in (select e->>'uid' from jsonb_array_elements(p->'players') e) limit 1;
  if dup is not null then raise exception 'UID % is already registered with another squad.', dup; end if;
  if length(coalesce(p->>'logo', '')) > 300000 then raise exception 'Logo too large (max ~200 KB).'; end if;

  insert into squads(name, tag, color, logo_url, captain_discord, owner_id)
  values (nm,
          case when char_length(tg) between 2 and 4 then tg else upper(left(replace(nm, ' ', ''), 3)) end,
          format('hsl(%s 75%% 55%%)', floor(random() * 360)::int),
          nullif(p->>'logo', ''),
          btrim(coalesce(p->>'captainDiscord', '')),
          u)
  returning id into sid;

  for pl in select * from jsonb_array_elements(p->'players') loop
    insert into players(squad_id, user_id, discord, ff_username, ff_uid, ign, role, slot, is_captain, position)
    values (sid,
            (select id from profiles where lower(discord) = lower(btrim(pl->>'discord')) limit 1),
            btrim(pl->>'discord'), btrim(pl->>'ffUsername'), pl->>'uid', btrim(pl->>'ign'),
            coalesce(pl->>'role', 'Flex'), pl->>'slot', coalesce((pl->>'isCaptain')::boolean, false), i);
    i := i + 1;
  end loop;

  insert into user_roles(user_id, role) values (u, 'captain') on conflict do nothing;
  perform _audit('registration.submit', format('Registered squad "%s" (pending approval)', nm));
  return sid;
end $$;

create or replace function review_squad(p_squad uuid, p_decision text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare q squads; nxt int;
begin
  perform require_role(array['admin']::app_role[]);
  select * into q from squads where id = p_squad for update;
  if not found then raise exception 'Squad not found'; end if;
  if (select groups_locked from settings) then raise exception 'Groups are locked.'; end if;
  if p_decision = 'approved' then
    if (select count(*) from squads where status = 'approved' and id <> p_squad) >= 16 then raise exception '16 squads already approved.'; end if;
    select min(n) into nxt from generate_series(1, 16) n
     where n not in (select number from squads where number is not null and id <> p_squad);
    update squads set status = 'approved', reject_reason = null, number = coalesce(number, nxt) where id = p_squad;
    update players set user_id = pr.id from profiles pr
     where players.squad_id = p_squad and players.user_id is null and lower(pr.discord) = lower(players.discord);
  elsif p_decision = 'rejected' then
    update squads set status = 'rejected', number = null, group_id = null, group_slot = null,
           reject_reason = coalesce(nullif(btrim(p_reason), ''), 'Registration did not meet the requirements.')
     where id = p_squad;
  else
    raise exception 'Invalid decision';
  end if;
  perform _audit('registration.review', format('%s "%s" %s', p_decision, q.name, coalesce(p_reason, '')));
end $$;

create or replace function edit_squad(p_squad uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare n int; clash text;
begin
  perform require_role(array['admin']::app_role[]);
  if p ? 'number' then
    n := (p->>'number')::int;
    if n < 1 or n > 16 then raise exception 'Squad number must be 1–16.'; end if;
    select name into clash from squads where id <> p_squad and number = n;
    if clash is not null then raise exception 'Number % is already used by %.', n, clash; end if;
  end if;
  update squads set
    name = coalesce(nullif(btrim(p->>'name'), ''), name),
    tag = coalesce(nullif(upper(btrim(p->>'tag')), ''), tag),
    number = coalesce(n, number),
    captain_discord = coalesce(p->>'captainDiscord', captain_discord),
    color = coalesce(p->>'color', color)
  where id = p_squad;
  if not found then raise exception 'Squad not found'; end if;
  perform _audit('squad.edit', format('%s %s', p_squad, p::text));
end $$;

create or replace function eliminate_squad(p_squad uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['admin','supervisor']::app_role[]);
  update squads set disqualified = true where id = p_squad;
  if not found then raise exception 'Squad not found'; end if;
  perform _audit('squad.eliminate', format('%s — %s', p_squad, p_reason));
end $$;

-- ════════════════ Fixtures & draw ════════════════

create or replace function seed_fixtures(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['admin']::app_role[]);
  if exists (select 1 from matches) then raise exception 'Fixtures already exist.'; end if;
  insert into matches(number, label, stage, group_id, day, starts_at, src_a, src_b, map)
  select (e->>'number')::int, e->>'label', (e->>'stage')::match_stage, e->>'group', (e->>'day')::int,
         (e->>'date')::timestamptz, e->'srcA', e->'srcB', coalesce(e->>'map', 'Bermuda')
  from jsonb_array_elements(p) e;
  perform _audit('fixtures.seed', format('%s fixtures created', jsonb_array_length(p)));
end $$;

create or replace function run_draw() returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform require_role(array['admin']::app_role[]);
  if (select groups_locked from settings) then raise exception 'Groups are locked. Unlock first to redraw.'; end if;
  select count(*) into n from squads where status = 'approved' and not disqualified;
  if n <> 16 then raise exception 'Need exactly 16 approved squads (have %).', n; end if;
  update squads set group_id = null, group_slot = null where group_id is not null or group_slot is not null;
  with r as (
    select id, (row_number() over (order by random()) - 1)::int as rn
    from squads where status = 'approved' and not disqualified
  )
  update squads s set group_id = chr(65 + r.rn % 4), group_slot = r.rn / 4 from r where s.id = r.id;
  update settings set draw_done = true where id = 1;
  perform _audit('draw.run', 'Group draw generated');
end $$;

create or replace function swap_groups(p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ga text; sa int; gb text; sb int;
begin
  perform require_role(array['admin']::app_role[]);
  if (select groups_locked from settings) then raise exception 'Groups are locked.'; end if;
  select group_id, group_slot into ga, sa from squads where id = p_a;
  select group_id, group_slot into gb, sb from squads where id = p_b;
  if ga is null or gb is null then raise exception 'Both squads must be drawn.'; end if;
  update squads set group_id = gb, group_slot = sb where id = p_a;
  update squads set group_id = ga, group_slot = sa where id = p_b;
  perform _audit('draw.swap', format('%s ↔ %s', p_a, p_b));
end $$;

create or replace function lock_groups(p_lock boolean) returns void
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  perform require_role(array['admin']::app_role[]);
  if p_lock then
    if not (select draw_done from settings) or (select count(*) from squads where group_id is not null) <> 16 then
      raise exception 'Run the draw first.'; end if;
    if not exists (select 1 from matches) then raise exception 'Initialize fixtures first (Admin → Overview).'; end if;
    update settings set groups_locked = true where id = 1;
    update matches m set
      squad_a = (select id from squads where group_id = m.src_a->>'group' and group_slot = (m.src_a->>'slot')::int),
      squad_b = (select id from squads where group_id = m.src_b->>'group' and group_slot = (m.src_b->>'slot')::int)
    where m.stage = 'group';
    perform _audit('draw.lock', 'Groups locked — group-stage fixtures generated');
  else
    if exists (select 1 from matches where status not in ('upcoming', 'ready')) then
      raise exception 'Matches have already been played — groups cannot be unlocked.'; end if;
    for p in select id from predictions where status = 'open' loop
      perform _refund(p.id, 'Refund — groups unlocked');
    end loop;
    update settings set groups_locked = false where id = 1;
    update matches set squad_a = null, squad_b = null, ready_a = false, ready_b = false, status = 'upcoming' where stage = 'group';
    perform _audit('draw.unlock', 'Groups unlocked by administrator');
  end if;
end $$;

-- ════════════════ Match management ════════════════

create or replace function edit_match(p_match uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare st match_status;
begin
  perform require_role(array['admin']::app_role[]);
  select status into st from matches where id = p_match;
  if st is null then raise exception 'Match not found'; end if;
  if st = 'completed' then raise exception 'Completed matches cannot be edited.'; end if;
  update matches set
    starts_at = case when p ? 'date' then (p->>'date')::timestamptz else starts_at end,
    map = coalesce(p->>'map', map),
    commentator_id = case when p ? 'commentatorId' then (p->>'commentatorId')::uuid else commentator_id end,
    supervisor_id = case when p ? 'supervisorId' then (p->>'supervisorId')::uuid else supervisor_id end
  where id = p_match;
  perform _audit('match.edit', format('%s %s', p_match, p::text));
end $$;

create or replace function set_participants(p_match uuid, p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  perform require_role(array['admin']::app_role[]);
  select * into m from matches where id = p_match for update;
  if m.stage = 'group' then raise exception 'Only knockout/deciding fixtures can be overridden.'; end if;
  if m.status <> 'upcoming' then raise exception 'Match already in progress.'; end if;
  if p_a = p_b then raise exception 'Pick two different squads.'; end if;
  update matches set src_a = '{"type":"fixed"}', src_b = '{"type":"fixed"}', squad_a = p_a, squad_b = p_b,
         ready_a = false, ready_b = false where id = p_match;
  perform _audit('bracket.override', format('#%s manually set', m.number));
end $$;

-- Bracket advancement: the verifying staff client computes the bracket from
-- verified results (src/engine/logic.ts) and pushes changed participants here.
create or replace function sync_participants(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e jsonb;
begin
  perform require_role(array['counter','supervisor','admin']::app_role[]);
  for e in select * from jsonb_array_elements(p) loop
    update matches set squad_a = (e->>'a')::uuid, squad_b = (e->>'b')::uuid, ready_a = false, ready_b = false, status = 'upcoming'
     where id = (e->>'id')::uuid and status in ('upcoming', 'ready') and stage <> 'group' and coalesce(src_a->>'type', '') <> 'fixed';
  end loop;
  perform _audit('bracket.sync', p::text);
end $$;

create or replace function create_tiebreak(p_group text, p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int; d timestamptz;
begin
  perform require_role(array['admin']::app_role[]);
  if p_a = p_b then raise exception 'Pick two different squads.'; end if;
  if (select count(*) from squads where id in (p_a, p_b) and group_id = p_group) <> 2 then
    raise exception 'Both squads must be in Group %.', p_group; end if;
  if exists (select 1 from matches where stage = 'group' and group_id = p_group and status not in ('completed', 'cancelled')) then
    raise exception 'Group stage for this group is not finished.'; end if;
  select max(number) + 1 into n from matches;
  select max(starts_at) + interval '50 minutes' * ((select count(*) from matches where stage = 'tiebreak') + 1)
    into d from matches where day = 5;
  insert into matches(number, label, stage, group_id, day, starts_at, squad_a, squad_b, map)
  values (n, format('Group %s · Decider', p_group), 'tiebreak', p_group, 5, d, p_a, p_b, 'Bermuda');
  perform _audit('match.tiebreak', format('Deciding match #%s', n));
end $$;

create or replace function set_room(p_match uuid, p_room text, p_pass text) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  perform require_role(array['hoster','admin']::app_role[]);
  select * into m from matches where id = p_match for update;
  if m.squad_a is null or m.squad_b is null then raise exception 'Squads not decided yet.'; end if;
  if p_room !~ '^\d{6,12}$' then raise exception 'Room ID must be 6–12 digits.'; end if;
  if char_length(p_pass) < 3 then raise exception 'Room password too short.'; end if;
  if exists (select 1 from match_rooms r join matches x on x.id = r.match_id
             where r.room_id = p_room and r.match_id <> p_match and x.status not in ('completed', 'cancelled')) then
    raise exception 'That Room ID is assigned to another active match — every matchup needs its own room.'; end if;
  insert into match_rooms(match_id, room_id, room_password, created_by) values (p_match, p_room, p_pass, auth.uid())
  on conflict (match_id) do update set room_id = excluded.room_id, room_password = excluded.room_password;
  if m.ready_a and m.ready_b and m.status = 'upcoming' then update matches set status = 'ready' where id = p_match; end if;
  perform _audit('room.set', format('Room set for match #%s', m.number));
end $$;

create or replace function confirm_ready(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; sq uuid;
begin
  perform require_role(array['captain']::app_role[]);
  select * into m from matches where id = p_match for update;
  select x into sq from my_squad_ids() x where x in (m.squad_a, m.squad_b) limit 1;
  if sq is null then raise exception 'Your squad is not in this match.'; end if;
  if m.status not in ('upcoming', 'ready') then raise exception 'Match already started.'; end if;
  if sq = m.squad_a then update matches set ready_a = true where id = p_match;
  else update matches set ready_b = true where id = p_match; end if;
  update matches set status = 'ready'
   where id = p_match and ready_a and ready_b and exists (select 1 from match_rooms where match_id = p_match);
  perform _audit('match.ready', format('Squad %s ready for #%s', sq, m.number));
end $$;

create or replace function start_match(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  perform require_role(array['hoster','admin']::app_role[]);
  select * into m from matches where id = p_match for update;
  if m.status not in ('upcoming', 'ready') then raise exception 'Cannot start a match that is %.', m.status; end if;
  if m.squad_a is null or m.squad_b is null then raise exception 'Squads not decided.'; end if;
  if not exists (select 1 from match_rooms where match_id = p_match) then raise exception 'Add the custom room before starting.'; end if;
  update matches set status = 'live', started_at = now() where id = p_match;
  perform _event(p_match, 'system', format('🔴 Match #%s is LIVE — predictions locked.', m.number), null);
  perform _audit('match.start', format('Started match #%s (predictions locked)', m.number));
end $$;

create or replace function submit_result(p_match uuid, p_winner uuid, p_kills jsonb, p_mvp uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; k record;
begin
  perform require_role(array['counter','admin']::app_role[]);
  select * into m from matches where id = p_match for update;
  if m.status not in ('live', 'review') then raise exception 'Results can only be recorded for live matches.'; end if;
  if p_winner is distinct from m.squad_a and p_winner is distinct from m.squad_b then raise exception 'Winner must be one of the two squads.'; end if;
  if p_mvp is not null and not exists (select 1 from players where id = p_mvp and squad_id in (m.squad_a, m.squad_b)) then
    raise exception 'MVP must be a player in this match.'; end if;
  delete from match_kills where match_id = p_match;
  for k in select key::uuid as pid, value as n from jsonb_each_text(coalesce(p_kills, '{}')) loop
    if not exists (select 1 from players where id = k.pid and squad_id in (m.squad_a, m.squad_b)) then
      raise exception 'Kill entry for a player outside this match.'; end if;
    if k.n !~ '^\d+$' or k.n::int > 60 then raise exception 'Kills must be whole numbers 0–60.'; end if;
    insert into match_kills(match_id, player_id, kills) values (p_match, k.pid, k.n::int);
  end loop;
  update matches set status = 'review', pending_winner = p_winner, pending_by = auth.uid(), pending_at = now(), mvp_player = p_mvp
   where id = p_match;
  perform _event(p_match, 'system', '🟡 Result submitted — under staff review.', null);
  perform _audit('result.submit', format('Submitted result for #%s', m.number));
end $$;

-- Verify result + victory bonus + pari-mutuel settlement, in ONE transaction.
create or replace function verify_result(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; s settings; win_pool int; total int; p record; pay int; wname text;
begin
  perform require_role(array['counter','supervisor','admin']::app_role[]);
  select * into m from matches where id = p_match for update;
  if m.status <> 'review' or m.pending_winner is null then raise exception 'No result awaiting verification.'; end if;
  if m.pending_by = auth.uid() and not has_role('admin') then
    raise exception 'Four-eyes rule: a different staff member must verify this result.'; end if;
  if m.settled then raise exception 'Match already settled.'; end if;
  select * into s from settings;

  update matches set status = 'completed', winner = m.pending_winner, pending_winner = null,
         completed_at = now(), settled = true where id = p_match;
  update match_kills set verified = true where match_id = p_match;
  insert into squad_rewards(squad_id, match_id, amount) values (m.pending_winner, p_match, s.victory_reward)
  on conflict (match_id) do nothing;

  select coalesce(sum(stake) filter (where pick = m.pending_winner), 0), coalesce(sum(stake), 0)
    into win_pool, total from predictions where match_id = p_match and status = 'open';

  for p in select * from predictions where match_id = p_match and status = 'open' for update loop
    if win_pool = 0 then
      perform _refund(p.id, format('Refund — nobody predicted the winner of #%s', m.number));
    elsif p.pick = m.pending_winner then
      pay := p.stake + floor(p.stake::numeric * (total - win_pool) / win_pool)::int;
      update predictions set status = 'won', payout = pay where id = p.id;
      insert into dhd_ledger(user_id, amount, kind, ref, memo, idem_key)
      values (p.user_id, pay, 'payout', p.id::text, format('Prediction won — match #%s', m.number), 'payout:' || p.id)
      on conflict (idem_key) do nothing;
    else
      update predictions set status = 'lost', payout = 0 where id = p.id;
    end if;
  end loop;

  select name into wname from squads where id = m.pending_winner;
  perform _event(p_match, 'result', format('🏁 OFFICIAL: %s win %s!', wname, m.label), null);
  perform _audit('result.verify', format('Verified #%s: winner %s', m.number, wname));
end $$;

create or replace function reject_result(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['counter','supervisor','admin']::app_role[]);
  update matches set status = 'live', pending_winner = null, pending_by = null, pending_at = null
   where id = p_match and status = 'review';
  if not found then raise exception 'Nothing to reject.'; end if;
  delete from match_kills where match_id = p_match and not verified;
  perform _audit('result.reject', format('Rejected result for %s', p_match));
end $$;

create or replace function cancel_match(p_match uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; p record;
begin
  perform require_role(array['supervisor','admin']::app_role[]);
  select * into m from matches where id = p_match for update;
  if m.status = 'completed' then raise exception 'Completed matches cannot be cancelled.'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Give a reason.'; end if;
  update matches set status = 'cancelled', settled = true where id = p_match;
  for p in select id from predictions where match_id = p_match and status = 'open' loop
    perform _refund(p.id, format('Refund — match #%s cancelled', m.number));
  end loop;
  perform _event(p_match, 'system', format('⛔ Match cancelled: %s. All DHD stakes refunded.', p_reason), null);
  perform _audit('match.cancel', format('Cancelled #%s: %s', m.number, p_reason));
end $$;

-- ════════════════ Commentary, chat, highlights ════════════════

create or replace function post_event(p_match uuid, p_kind text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  perform require_role(array['commentator','admin']::app_role[]);
  select commentator_id into c from matches where id = p_match;
  if not has_role('admin') and c is distinct from auth.uid() then raise exception 'You are not the assigned commentator for this match.'; end if;
  if p_kind not in ('start','intro','update','moment','kill','result','mvp') then raise exception 'Invalid commentary type.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 400 then raise exception 'Commentary must be 1–400 characters.'; end if;
  perform _event(p_match, p_kind, btrim(p_body), auth.uid());
end $$;

create or replace function post_chat(p_match uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := require_user();
begin
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 200 then raise exception 'Message must be 1–200 characters.'; end if;
  if exists (select 1 from chat_messages where user_id = u and created_at > now() - interval '3 seconds') then
    raise exception 'Slow mode: wait a few seconds.'; end if;
  insert into chat_messages(match_id, user_id, body) values (p_match, u, btrim(p_body));
end $$;

create or replace function add_highlight(p_match uuid, p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['commentator','admin']::app_role[]);
  if not (p_url ~ '^https?://' or (p_url like 'data:image/%' and length(p_url) < 400000)) then
    raise exception 'Provide an http(s) link or an image.'; end if;
  update matches set highlights = array_append(highlights, p_url) where id = p_match;
  perform _audit('match.highlight', p_match::text);
end $$;

-- ════════════════ DHD predictions ════════════════

create or replace function place_prediction(p_match uuid, p_pick uuid, p_stake int, p_idem text) returns uuid
language plpgsql security definer set search_path = public as $$
declare u uuid := require_user(); m matches; s settings; bal int; pid uuid;
begin
  select * into s from settings;
  select * into m from matches where id = p_match for update;   -- serialises against start_match
  if m.id is null then raise exception 'Match not found'; end if;
  if m.squad_a is null or m.squad_b is null then raise exception 'Squads not decided yet'; end if;
  if m.status not in ('upcoming', 'ready') then raise exception 'Locked — match has started'; end if;
  if now() >= m.starts_at then raise exception 'Locked — scheduled start time reached'; end if;
  if not m.predictions_open then raise exception 'Closed by administrators'; end if;
  if p_pick is distinct from m.squad_a and p_pick is distinct from m.squad_b then raise exception 'Pick one of the two squads.'; end if;
  if p_stake < s.min_stake then raise exception 'Minimum stake is % DHD.', s.min_stake; end if;
  if p_stake > s.max_stake then raise exception 'Maximum stake is % DHD per match.', s.max_stake; end if;
  if exists (select 1 from my_squad_ids() x where x in (m.squad_a, m.squad_b)) then
    raise exception 'Players cannot predict on their own squad’s matches.'; end if;
  perform pg_advisory_xact_lock(hashtext(u::text));                -- no concurrent double-spend
  if exists (select 1 from predictions where user_id = u and match_id = p_match and status <> 'refunded') then
    raise exception 'You already have a locked prediction on this match.'; end if;
  select coalesce(sum(amount), 0) into bal from dhd_ledger where user_id = u;
  if bal < p_stake then raise exception 'Insufficient DHD balance.'; end if;

  insert into predictions(user_id, match_id, pick, stake) values (u, p_match, p_pick, p_stake) returning id into pid;
  begin
    insert into dhd_ledger(user_id, amount, kind, ref, memo, idem_key)
    values (u, -p_stake, 'stake', pid::text, format('Prediction stake — match #%s', m.number), 'stake:' || u || ':' || p_idem);
  exception when unique_violation then
    raise exception 'Duplicate transaction blocked';
  end;
  perform _audit('prediction.place', format('%s DHD on #%s', p_stake, m.number));
  return pid;
end $$;

create or replace function set_predictions_open(p_match uuid, p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['admin']::app_role[]);
  update matches set predictions_open = p_open where id = p_match;
  perform _audit('prediction.toggle', format('%s %s', p_match, p_open));
end $$;

create or replace function cancel_predictions(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p record; n int := 0;
begin
  perform require_role(array['admin']::app_role[]);
  for p in select id from predictions where match_id = p_match and status = 'open' loop
    perform _refund(p.id, 'Refund — predictions cancelled by administrators');
    n := n + 1;
  end loop;
  update matches set predictions_open = false where id = p_match;
  perform _audit('prediction.cancel', format('Cancelled %s predictions on %s', n, p_match));
end $$;

create or replace function set_stake_limits(p_min int, p_max int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['admin']::app_role[]);
  if p_min < 1 or p_max < p_min or p_max > 100000 then raise exception 'Invalid limits.'; end if;
  update settings set min_stake = p_min, max_stake = p_max where id = 1;
  perform _audit('prediction.limits', format('%s–%s DHD', p_min, p_max));
end $$;

-- ════════════════ Rewards & champion ════════════════

create or replace function mark_reward_paid(p_reward uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['admin']::app_role[]);
  update squad_rewards set status = 'paid', paid_at = now() where id = p_reward and status = 'pending';
  if not found then raise exception 'Already marked paid — duplicate payment blocked.'; end if;
  perform _audit('reward.paid', p_reward::text);
end $$;

create or replace function mark_prize_paid(p_prize text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['admin']::app_role[]);
  if (select champion_squad from settings) is null then raise exception 'Champion not declared yet.'; end if;
  if p_prize = 'champion' then update settings set champion_paid = true where id = 1;
  elsif p_prize = 'topKiller' then update settings set top_killer_paid = true where id = 1;
  else raise exception 'Unknown prize'; end if;
  perform _audit('prize.paid', p_prize);
end $$;

create or replace function declare_champion() returns void
language plpgsql security definer set search_path = public as $$
declare f matches; wname text;
begin
  perform require_role(array['admin']::app_role[]);
  select * into f from matches where stage = 'final';
  if f.id is null or f.status <> 'completed' or f.winner is null then
    raise exception 'The Grand Final must be completed and verified first.'; end if;
  select name into wname from squads where id = f.winner;
  update settings set champion_squad = f.winner, champion_declared_at = now() where id = 1;
  insert into announcements(category, title, body, author_id) values ('champion',
    format('👑 %s are the CHAMPIONS OF MOROCCO!', wname),
    format('ONE TOURNAMENT. SIXTEEN SQUADS. ONE CROWN. Congratulations to %s — winners of FREE FIRE: MOROCCAN SQUAD CLASH 🇲🇦 and the 500 MAD grand prize!', wname),
    auth.uid());
  perform _audit('champion.declare', wname);
end $$;

create or replace function set_match_of_day(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['admin']::app_role[]);
  update settings set match_of_day = p_match where id = 1;
  perform _audit('match.featured', coalesce(p_match::text, 'cleared'));
end $$;

create or replace function update_settings(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['admin']::app_role[]);
  update settings set
    sniper_rule_enabled = coalesce((p->'sniperRule'->>'enabled')::boolean, sniper_rule_enabled),
    sniper_rule_confirmed = coalesce((p->'sniperRule'->>'confirmed')::boolean, sniper_rule_confirmed),
    sniper_rule_text = coalesce(p->'sniperRule'->>'text', sniper_rule_text),
    max_laptops = coalesce((p->>'maxLaptops')::int, max_laptops),
    enforce_registration_window = coalesce((p->>'enforceRegistrationWindow')::boolean, enforce_registration_window),
    victory_reward = coalesce((p->>'victoryReward')::int, victory_reward)
  where id = 1;
  perform _audit('settings.update', p::text);
end $$;

-- ════════════════ Reports & penalties ════════════════

create or replace function submit_report(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare u uuid := require_user(); rid uuid;
begin
  if char_length(btrim(coalesce(p->>'explanation', ''))) < 30 then raise exception 'Explain the issue clearly (at least 30 characters).'; end if;
  if btrim(coalesce(p->>'evidence', '')) = '' then raise exception 'Screenshot or video evidence is required.'; end if;
  if btrim(coalesce(p->>'target', '')) = '' then raise exception 'Specify the reported player or squad.'; end if;
  if p->>'category' not in ('cheating','unauthorized_player','incorrect_uid','rule_violation','room_problem','incorrect_result','unfair_behavior') then
    raise exception 'Invalid violation type.'; end if;
  if (select count(*) from reports where reporter_id = u and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Anti-spam: max 3 reports per 10 minutes.'; end if;
  insert into reports(reporter_id, target, target_squad, ff_uid, match_number, occurred_at, category, explanation, evidence_url)
  values (u, btrim(p->>'target'), nullif(p->>'targetSquadId', '')::uuid, nullif(p->>'uid', ''), nullif(p->>'matchNumber', '')::int,
          coalesce((p->>'when')::timestamptz, now()), p->>'category', btrim(p->>'explanation'), btrim(p->>'evidence'))
  returning id into rid;
  perform _audit('report.submit', format('Report against %s (%s)', p->>'target', p->>'category'));
  return rid;
end $$;

create or replace function checker_review(p_report uuid, p_notes text, p_forward boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['cheat_checker','supervisor','admin']::app_role[]);
  update reports set checker_notes = p_notes, checker_id = auth.uid(),
         status = case when p_forward then 'investigation'::report_status else 'dismissed'::report_status end,
         decision = case when p_forward then decision else 'Dismissed at evidence review: ' || p_notes end
   where id = p_report and status in ('submitted', 'checker_review');
  if not found then raise exception 'Report already past evidence review.'; end if;
  perform _audit('report.checker', format('%s %s', case when p_forward then 'Forwarded' else 'Dismissed' end, p_report));
end $$;

create or replace function supervisor_decide(p_report uuid, p_decision text, p_penalty text, p_squad uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['supervisor']::app_role[]);
  if btrim(coalesce(p_decision, '')) = '' then raise exception 'Write the decision.'; end if;
  if p_penalty not in ('none','warning','match_dq','tournament_dq') then raise exception 'Invalid penalty.'; end if;
  update reports set decision = p_decision, penalty = p_penalty, decided_by = auth.uid(), status = 'decided'
   where id = p_report and status = 'investigation';
  if not found then raise exception 'Report must be under investigation.'; end if;
  if p_penalty <> 'none' then
    if p_squad is null then raise exception 'Choose the penalised squad.'; end if;
    perform _penalty(p_squad, p_penalty, p_decision, p_report);
  end if;
  perform _audit('report.decide', format('%s: %s', p_report, p_penalty));
end $$;

create or replace function issue_penalty(p_squad uuid, p_type text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['supervisor']::app_role[]);   -- only the Supervisor issues penalties
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Give a reason.'; end if;
  perform _penalty(p_squad, p_type, p_reason, null);
end $$;

create or replace function announce_report(p_report uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r reports;
begin
  perform require_role(array['admin','supervisor']::app_role[]);
  update reports set status = 'announced' where id = p_report and status = 'decided' returning * into r;
  if not found then raise exception 'Only decided reports can be announced.'; end if;
  insert into announcements(category, title, body, author_id) values ('investigation',
    format('🛡️ Investigation outcome — %s', r.target),
    r.decision || case when r.penalty is not null and r.penalty <> 'none' then format(' Penalty: %s.', upper(replace(r.penalty, '_', ' '))) else ' No penalty issued.' end,
    auth.uid());
  perform _audit('report.announce', p_report::text);
end $$;

-- ════════════════ Announcements & staff ════════════════

create or replace function publish_announcement(p_category text, p_title text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['admin','supervisor']::app_role[]);
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_body, '')) = '' then raise exception 'Title and body required.'; end if;
  insert into announcements(category, title, body, author_id) values (p_category, btrim(p_title), btrim(p_body), auth.uid());
  perform _audit('announce.publish', p_title);
end $$;

create or replace function delete_announcement(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['admin','supervisor']::app_role[]);
  delete from announcements where id = p_id;
  perform _audit('announce.delete', p_id::text);
end $$;

create or replace function set_roles(p_user uuid, p_roles text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(array['admin']::app_role[]);
  if p_user = auth.uid() and not ('admin' = any(p_roles)) then raise exception 'You cannot remove your own admin role.'; end if;
  delete from user_roles where user_id = p_user;
  insert into user_roles(user_id, role)
  select p_user, r::app_role from unnest(case when cardinality(p_roles) = 0 then array['viewer'] else p_roles end) r
  on conflict do nothing;
  perform _audit('staff.roles', format('%s: %s', p_user, array_to_string(p_roles, ', ')));
end $$;

-- ════════════════ Realtime ════════════════
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      settings, squads, players, matches, match_rooms, match_kills, match_events, chat_messages,
      predictions, dhd_ledger, squad_rewards, reports, penalties, announcements, user_roles, profiles;
  end if;
end $$;

-- ════════════════ Editable website text ════════════════
-- (same as supabase/002_site_content.sql)
create table if not exists site_content (
  key text primary key check (key ~ '^[\w.]{1,100}$'),
  value text not null check (char_length(value) between 1 and 5000),
  updated_by uuid references profiles,
  updated_at timestamptz not null default now()
);
alter table site_content enable row level security;
drop policy if exists "public read" on site_content;
create policy "public read" on site_content for select using (true);

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

-- ════════════════ Email sign-in + staff access by email ════════════════
-- (same as supabase/003_email_access.sql)

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

-- ════════════════ First administrator ════════════════
-- Run supabase/make_me_admin.sql once (it contains your email). After that,
-- invite other staff by email from the website: Admin → Staff.

-- ════════════════ Website read access ════════════════
-- (same as supabase/004_api_read_access.sql) Newer Supabase projects don't
-- grant table access to the API roles automatically. SELECT only: RLS still
-- filters rows, and all writes go through the functions above.
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant select on tables to anon, authenticated;
notify pgrst, 'reload schema';
