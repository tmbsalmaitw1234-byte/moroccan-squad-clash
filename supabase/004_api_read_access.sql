-- ════════════════════════════════════════════════════════════════════
-- Let the website READ the tables (newer Supabase projects no longer do
-- this automatically). Row Level Security still decides which rows each
-- visitor can see, and every change still goes through the secure
-- functions — this grants SELECT only, never insert/update/delete.
-- Already included at the end of schema.sql. Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant select on tables to anon, authenticated;

-- Refresh the API's view of the database
notify pgrst, 'reload schema';
