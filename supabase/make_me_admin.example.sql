-- ════════════════════════════════════════════════════════════════════
-- Make yourself the administrator (run ONCE, after schema.sql)
-- Supabase → SQL Editor → paste this file → Run.
--
-- Works whether or not you have signed in yet: if you haven't, you become
-- admin automatically the first time you sign in with this email.
-- Copy this file to make_me_admin.sql, put your email below, and run it.
-- (make_me_admin.sql is git-ignored so your email never gets uploaded.)
-- ════════════════════════════════════════════════════════════════════

do $$
declare
  admin_email text := lower('YOUR_EMAIL@example.com');
begin
  insert into role_invites(email, role)
  values (admin_email, 'admin'), (admin_email, 'supervisor')
  on conflict do nothing;

  insert into user_roles(user_id, role)
  select u.id, r::app_role
  from auth.users u, unnest(array['admin', 'supervisor']) r
  where lower(u.email) = admin_email
  on conflict do nothing;
end $$;

-- Check: should list your email with admin + supervisor
select email, role from role_invites order by email, role;
