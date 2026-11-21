# 🏆 FREE FIRE: MOROCCAN SQUAD CLASH 🇲🇦

The official headquarters website for the tournament: registration, group draw, league standings, schedule, live match center, knockout bracket, DHD prediction arena, prizes, rules, reports, staff and an admin dashboard.

**Stack:** React 18 · TypeScript · Tailwind CSS 4 · Vite · Supabase (Postgres, Auth, Realtime)

The app runs in one of two modes, chosen automatically:

| | **Demo mode** (no `.env`) | **Live mode** (Supabase configured) |
|---|---|---|
| Accounts | Account switcher, anyone can pick any role | **Sign in with Discord** |
| Data | This browser only (localStorage) | Shared Postgres database |
| Security | Rules checked in the browser (not tamper-proof) | Rules enforced **in the database** (RLS + server functions) |
| Live updates | — | Realtime: chat, commentary, results, pools update for everyone |
| Sample data & simulator | ✅ | — (real tournament data only) |

## Run it

```powershell
npm install
npm run dev        # http://localhost:5173
```

> **👉 To put the site online with email sign-in and staff access, follow [GO-LIVE.md](GO-LIVE.md).** The section below is the technical reference.

**Already set up with an older `schema.sql`?** Run these once in the SQL Editor (both are safe to re-run): [`002_site_content.sql`](supabase/002_site_content.sql) for editable text, and [`003_email_access.sql`](supabase/003_email_access.sql) for email sign-in and staff invites. Then run [`make_me_admin.sql`](supabase/make_me_admin.sql).

## Go live with Supabase (about 10 minutes)

1. **Create a project** at [supabase.com](https://supabase.com) (free tier is fine).
2. **Run the schema**: Supabase → *SQL Editor* → paste all of [`supabase/schema.sql`](supabase/schema.sql) → *Run*. Use a new, empty project; the script creates everything (tables, security policies, 40 server functions, Realtime).
3. **Enable Discord sign-in**
   - Create an app at the [Discord Developer Portal](https://discord.com/developers/applications) → *OAuth2*. Copy the **Client ID** and **Client Secret**.
   - Add this redirect URL in Discord: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - Supabase → *Authentication → Sign In / Providers → Discord* → enable it and paste the ID and secret.
   - Supabase → *Authentication → URL Configuration*: set **Site URL** to where the site will live (e.g. `https://squadclash.example.com`) and add `http://localhost:5173` to **Redirect URLs** for local testing.
4. **Connect the app**: copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase → *Project Settings → API*). Restart `npm run dev`.
5. **Make yourself admin**: sign in on the site once with Discord, then run this in the SQL Editor (use your Discord username):
   ```sql
   insert into user_roles (user_id, role)
   select id, r::app_role from profiles, unnest(array['admin','supervisor']) r
   where discord = 'your_discord_username';
   ```
   Refresh the site; **Admin Dashboard** now appears. Assign every other staff role from *Admin → Staff*. Staff must sign in once before they appear there.
6. **Create the fixtures**: *Admin → Overview → Initialize fixtures* (creates the 31 official matches from the calendar).
7. **Deploy**: `npm run build`, then host the `dist/` folder on any static host (Netlify, Vercel, Cloudflare Pages…). Set the same two `VITE_` variables in the host's settings, because they are baked in at build time.

### Changing the website's wording

Signed in as admin, use either:
- **✏️ Edit site text** (bottom of the sidebar): every editable text gets a dotted gold outline. Click one, type, *Save*.
- **Admin → Site text**: every text in one list, grouped by page, with search.

Write `**word**` to highlight a word. In lists, put one item per line. *Reset to default* brings back the original wording. Edits are saved to the database (`site_content`), appear for every visitor immediately, and are recorded in the audit log. Only administrators can change them.

> Already ran an older `schema.sql`? Run [`supabase/002_site_content.sql`](supabase/002_site_content.sql) once in the SQL Editor to add text editing. It's safe to run more than once.

Default wording lives in [`src/content/defaults.ts`](src/content/defaults.ts). To make a new piece of text editable, add it there and use `<Txt k="…" />` in the page.

### Tournament flow in live mode

Squads register (Nov 22–24; the window is **enforced** by default). The admin approves 16, runs the draw and locks the groups, and the group fixtures fill in automatically. For each match: the hoster publishes the room and starts the match, the counter records the result and kills, and a **different** staff member verifies it. Verification credits the 200 DHD bonus, settles every prediction, and advances the bracket. Finally the admin declares the champion.

### How security works

- Visitors can only **read**. Every change is a Postgres function that checks the caller's Discord account and role first. Nothing can be written to a table directly.
- **Room passwords** are only sent to the two squads' registered members and authorised staff. Other visitors never receive them.
- **Free Fire UIDs** are masked for the public (`123••••89`); staff and the squad itself see them in full.
- **DHD** is an append-only ledger with no balance field to edit. Payouts and refunds carry unique keys, so they can never be applied twice. Verification, the bonus and settlement happen in a single transaction.
- The **four-eyes rule** (submitter ≠ verifier), the commentator-cannot-edit-results rule and Supervisor-only penalties are all enforced in the database.
- Every important action is written to `audit_log`.

**Tested:** the schema was run end to end in a local Postgres (PGlite) with 68 checks: 16 squads registered, drawn and locked, a full group stage played, and every role's permissions tried. The checks covered RLS visibility, duplicate-UID and stake-limit rejection, exact pari-mutuel payouts, refunds, DHD conservation and duplicate-payment blocking. It has **not** yet been run on a real Supabase project or with real Discord sign-in.

### Known limits

- **Discord DHD is still simulated.** Wallets start at 1,000 DHD in the site's own ledger. To use your server's real DHD economy, a Discord bot must read `dhd_ledger` and `squad_rewards` and credit balances. That needs your bot's API.
- **Bracket advancement** is calculated by the verifying staff member's browser (same code as the standings) and saved through a staff-only function. If it ever looks stale: *Admin → Overview → Re-sync bracket*.
- **Logos and evidence screenshots** are stored inline (≤200 KB / ≤300 KB). For larger files, move them to Supabase Storage.
- Discord usernames come from Discord's OAuth profile. Players are linked to their squad when the Discord username they registered with matches the one they sign in with.

## Before launch — decisions to confirm

1. **Sniper restriction wording**: editable in *Admin → Settings*; shown as "pending confirmation" until ticked.
2. **DHD economy**: min/max stake (default 10–500) and starting balance (1,000; change `settings.starting_balance` in SQL). DHD must have no real-money value.
3. **Rooms**: one custom room per matchup (Room IDs cannot be reused across active matches).
4. **Match times**: 18:00–21:20 Morocco time by default; editable per match.

## Project layout

```
src/
  engine/
    backend.ts     the interface both backends implement
    instance.ts    picks Supabase or demo from .env
    supabase.ts    live backend: reads + RPC calls + Realtime + Discord auth
    server.ts      demo backend: same actions, in the browser
    logic.ts       standings, tie-breakers, bracket, pools, leaderboards (shared)
    config.ts      calendar, fixtures, bracket wiring
    permissions.ts roles → permissions (UI)
    seed.ts        demo sample data
  components/  pages/
supabase/schema.sql   tables, RLS, server functions, Realtime
.env.example
```

Sample squads, players and staff in demo mode are fictional. Community tournament — not affiliated with Garena.
