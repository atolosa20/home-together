# Home Together

A shared home app for two phones: shopping list, chores and to-dos, a shared calendar and the dogs.
English and Spanish, live sync between both phones, and push notifications on iPhone.

- **App:** plain HTML/CSS/JavaScript in this folder, hosted free on GitHub Pages.
- **Data and login:** Supabase (free tier). Each home's data is private to the people in it.
- **Notifications:** two small Supabase Edge Functions:
  - `notify` tells your partner when you add or finish something.
  - `daily` sends a morning reminder of what's due.

Setup takes about 30–45 minutes, once. You need: a Supabase account, a GitHub account and
[Node.js](https://nodejs.org) (LTS) installed on your Windows PC.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com>, sign in and click **New project**.
2. Name it `home-together`, choose a strong database password (save it), and pick the region
   **West EU (Ireland)** or **Central EU (Frankfurt)**.
3. Wait until the project is ready (about 2 minutes).

## 2. Create the database

1. In the project, open **SQL Editor → New query**.
2. Open `supabase/schema.sql` from this folder, copy everything, paste it in and click **Run**.
   You should see "Success. No rows returned".

## 3. Make the notification keys

Open **PowerShell** in this folder and run:

```powershell
npx web-push generate-vapid-keys
```

It prints a **Public Key** and a **Private Key**. Keep both for the next steps.
Also create a random secret for the morning reminder:

```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Keep that value too; it's your `CRON_SECRET`.

## 4. Fill in `config.js`

In Supabase open **Project Settings → API** and copy:

- **Project URL** → `SUPABASE_URL`
- **anon public** key → `SUPABASE_ANON_KEY`

Then paste the VAPID **Public Key** from step 3 into `VAPID_PUBLIC_KEY`. Save the file.

These three values are safe to publish. The private key and the cron secret never go in this file.

## 5. Deploy the notification functions

In PowerShell, in this folder:

```powershell
npx supabase login
npx supabase init            # answer "N" to the questions about VS Code / IntelliJ
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:alextolosa1999@gmail.com" CRON_SECRET="..."
npx supabase functions deploy notify
npx supabase functions deploy daily --no-verify-jwt
```

`YOUR-PROJECT-REF` is the part of your Project URL before `.supabase.co`.

## 6. Schedule the morning reminder

1. Open `supabase/daily-reminder.sql` and replace:
   - `YOUR-PROJECT-REF` with your project ref.
   - `YOUR-CRON-SECRET` with your cron secret.
2. Paste it into **SQL Editor** and click **Run**.

The reminder goes out at 08:30 in summer and 07:30 in winter, and only on days when something is due or planned.

## 7. Put the app online (GitHub Pages)

1. On GitHub, create a new **public** repository called `home-together`.
2. Upload the contents of this folder. Either drag the files into the repository page
   (**Add file → Upload files**), or use GitHub Desktop. If you use git from PowerShell, set your
   identity first:
   ```powershell
   git config --global user.email "alextolosa1999@gmail.com"
   ```
3. In the repository open **Settings → Pages**, set **Source: Deploy from a branch**, **Branch: main / (root)**,
   and save. After a minute the app is live at `https://YOUR-GITHUB-USERNAME.github.io/home-together/`.
4. Back in Supabase, open **Authentication → URL Configuration**:
   - Set **Site URL** to that address.
   - Add it under **Redirect URLs** too.

   This makes the confirmation email open your app.

## 8. Install it on both iPhones

On each iPhone:

1. Open the app address in **Safari**. Tap **Share → Add to Home Screen** and add it. The icon is the lotus.
2. Open it **from the home-screen icon** (needed for notifications on iPhone) and tap **New here? Create an account**.
3. Confirm the email: tap the link in the email, then go back to the app and sign in.
4. Set up the home:
   - **You:** choose **Create a home** and give it a name.
   - **Your wife:** chooses **Join with a code** and types the 6-letter code. You'll find the code under **⚙ Settings → Invite your partner**.
5. In **⚙ Settings → Notifications**, tap **Turn on notifications**, allow them, then tap **Send a test**.

Notifications need iOS 16.4 or newer, with the app opened from the home-screen icon.

---

## How it works

- **Sync:** every change is saved to Supabase and pushed live to the other phone while the app is open.
  When you reopen the app it reloads everything.
- **Notifications:**
  - Your partner gets one when you add something to the shopping list, a calendar plan, a new chore or to-do, or when you mark a chore done.
  - You don't get notified about your own changes.
  - Each person receives notifications in the language they chose in the app.
- **Privacy:** database rules make sure each person only ever sees their own home's data.
  The anon key in `config.js` can't get around that.

## Updating the app

The app online only changes when you **publish a GitHub release**. Pushing or merging to `main` does not change it.

1. Make the change on a branch and open a pull request. The **Check** workflow makes sure the scripts still load.
2. Merge the pull request into `main`.
3. Publish a release: on GitHub open **Releases → Draft a new release**, create a tag like `v1.1.0`, and write a short
   summary in the notes. Or, from PowerShell:
   ```powershell
   gh release create v1.1.0 --title "v1.1.0" --notes "Dogs page shows the next vet visit."
   ```
4. The **Publish release** workflow puts that version online (about a minute). An open app shows
   **New version available · v1.1.0** with the summary and an **Update now** button. If the app was closed, it opens on
   the new version and shows **What's new · v1.1.0** once.

The version number and the first lines of the release notes are what the phones see, so keep the notes short.
The current version is shown at the bottom of **⚙ Settings**.

- **Change a function:** after editing a file in `supabase/functions`, run the matching `npx supabase functions deploy ...` command again.

## Files

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js`, `i18n.js` | The app |
| `config.js` | Your Supabase and notification keys (public ones only) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Home-screen install, offline shell and notifications |
| `supabase/schema.sql` | Database tables and security rules (run once) |
| `supabase/functions/notify` | Sends "your partner added…" notifications |
| `supabase/functions/daily` | Sends the morning reminder |
| `supabase/daily-reminder.sql` | Schedules the morning reminder |
