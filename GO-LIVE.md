# 🚀 Go live: your official tournament website

After these steps the site runs on its own, without Claude:

- It has a **public address** anyone can open.
- **You** sign in with **your email** and are the administrator.
- You give your **staff team** access by email from the website.
- Data is saved in your own database. You can edit text, run matches and manage everything from the browser.

Time needed: about 30 minutes. Everything below is **free**. You need two free accounts:

| Service | What it does | Sign up |
|---|---|---|
| **Supabase** | Database, email sign-in, live updates | supabase.com |
| **Netlify** | Puts the website online | netlify.com |

---

## Step 1: Create the database (Supabase)

1. Go to **supabase.com** → *Start your project* → sign up (your email or GitHub).
2. Click **New project**. Name it `squad-clash`, set a strong **database password** (save it in a password manager) and pick the region closest to Morocco (e.g. *West EU*). Click **Create**, then wait about 2 minutes.
3. Left menu → **SQL Editor** → **New query**.
4. Open the file `supabase/schema.sql` from this project in Notepad, copy **everything**, paste it into the editor and click **Run**. You should see *Success. No rows returned*.
5. Click **New query** again. Paste everything from `supabase/make_me_admin.sql` and click **Run**. Your email appears in the result with `admin` and `supervisor`.
   > This file already contains **your email address**. To use a different one, edit the email line before running it.

## Step 2: Turn on email sign-in

1. Left menu → **Authentication** → **Sign In / Providers**. Check that **Email** is enabled (it is by default).
2. Optional: enable **Discord** too, so players can use "Continue with Discord". Follow the Discord steps in `README.md`.
3. ⚠️ **Important for a real tournament:** Supabase's built-in email sender only sends a few emails per hour, which is fine for testing but not for 80 players.
   Go to **Project Settings → Authentication → SMTP Settings** and connect a free email service such as **Brevo** (300 emails/day free) or **Resend**. Each of these shows you the 4 values to paste in (host, port, username, password).

## Step 3: Connect the website to your database

1. In Supabase: **Project Settings → API** (or *Data API*). Copy the **Project URL** and the **anon public** key.
   > ❗ Never use the **service_role** key anywhere in the website.
2. In this project folder, copy `.env.example`, rename the copy to `.env`, and paste in the two values:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
3. Open PowerShell in the project folder and build the site:
   ```powershell
   npm install
   ```
   ```powershell
   npm run build
   ```
   This creates a folder called **`dist`**. That folder *is* your website.

## Step 4: Put it online (Netlify)

1. Go to **app.netlify.com** → sign up (free).
2. Go to **app.netlify.com/drop** and **drag the `dist` folder** onto the page. In a few seconds you get an address like `https://random-name-123.netlify.app`.
3. Give it a nicer name: **Site configuration → Change site name**, e.g. `moroccan-squad-clash` → `https://moroccan-squad-clash.netlify.app`.
   You can also connect your own domain later (*Domain management*).

## Step 5: Tell Supabase your website address

Supabase → **Authentication → URL Configuration**:
- **Site URL**: your Netlify address, e.g. `https://moroccan-squad-clash.netlify.app`
- **Redirect URLs** → *Add URL*: the same address, plus `http://localhost:5173` if you also want to test on your computer.

Without this, sign-in links won't bring people back to your site.

## Step 6: Sign in as the administrator

1. Open your website → **Sign in** (bottom of the menu) → type your email → **Email me a sign-in link**.
2. Open the email **on the same device and browser** and click the link. You're back on the site, signed in.
3. **Admin Dashboard** now appears in the menu. 🎉
4. **Admin → Overview → Initialize fixtures** (do this once). It creates the 31 official matches.

## Step 7: Give your staff team access

**Admin Dashboard → Staff → Staff access by email**:
1. Type the staff member's email.
2. Choose their roles: 🎙️ Hoster · 🛡️ Cheat Checker · 📊 Counter · 👁️ Supervisor · 🎤 Commentator · ⚙️ Administrator.
3. Click **Give access**.

Tell them to open the website, click **Sign in**, and use **that same email**. They get their access automatically. The list shows ⏳ *Waiting for first sign-in* until they do, then ✅ *Active*. Use **Change** to edit someone's roles and **Remove** to take access away (it takes effect immediately).

> Results need two people: whoever records a result (Counter) can't also verify it. Make sure at least two staff members can verify (Counter, Supervisor or Admin).

---

## Updating the website later

- **Text, rules, matches, staff, announcements:** do it on the website. No rebuild needed.
- **Code or design changes:** after editing files, run `npm run build` again and drag the new `dist` folder onto your site in Netlify (**Deploys** → drag and drop).

## Good to know

- **Free Supabase projects pause after 7 days with no visitors.** During the tournament that won't happen. If it pauses, open the Supabase dashboard and click **Restore**.
- **Backups:** Supabase → **Database → Backups** (daily backups on paid plans). On free, export important tables from *Table Editor → Export to CSV*.
- **DHD** is still the site's own simulated wallet. Paying real DHD on your Discord server needs a Discord bot (not included).
- **Keep private:** `.env` (your keys) and `supabase/make_me_admin.sql` (your email). Never post them publicly.

## Something not working?

| Problem | Fix |
|---|---|
| "Could not reach the tournament database" | Check the two values in `.env`, then rebuild and re-upload `dist`. |
| Sign-in link opens but you're not signed in | Open the link in the **same browser** you requested it from, and check Step 5. |
| No sign-in email arrives | Check spam. The built-in sender is rate-limited, so set up SMTP (Step 2.3). |
| Signed in but no Admin Dashboard | Run `make_me_admin.sql` again with exactly the email you signed in with, then refresh. |
| Staff member has no access | Their email in *Staff access* must match exactly the email they sign in with. |
