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
3. Later changes to the database are in `supabase/migrations/` (the first file there is the same as `schema.sql`).
   After step 5, run `npx supabase db push` to apply the newer ones.

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
npx supabase functions deploy notify --no-verify-jwt
npx supabase functions deploy daily --no-verify-jwt
npx supabase functions deploy remind --no-verify-jwt
npx supabase functions deploy walk --no-verify-jwt
npx supabase functions deploy backup --no-verify-jwt
```

Each function checks who is calling itself: `notify` the signed-in user, `daily` and `remind` the cron secret,
`walk` the personal Shortcut link, and `backup` the `BACKUP_SECRET` (set it with `supabase secrets set` too).

`YOUR-PROJECT-REF` is the part of your Project URL before `.supabase.co`.

## 6. Schedule the morning reminder

1. Open `supabase/daily-reminder.sql` and replace:
   - `YOUR-PROJECT-REF` with your project ref.
   - `YOUR-CRON-SECRET` with your cron secret.
2. Paste it into **SQL Editor** and click **Run**.

The reminder goes out at 08:30 in summer and 07:30 in winter, and only on days when something is due or planned.

Do the same with `supabase/reminders.sql`. It checks every 15 minutes for reminders before calendar plans
and for dog medicines that are due.

## 7. Put the app online (GitHub Pages)

1. On GitHub, create a new **public** repository called `home-together`.
2. Upload the contents of this folder. Either drag the files into the repository page
   (**Add file → Upload files**), or use GitHub Desktop. If you use git from PowerShell, set your
   identity first:
   ```powershell
   git config --global user.email "alextolosa1999@gmail.com"
   ```
3. In the repository open **Settings → Pages** and set **Source: GitHub Actions**. Then publish a release (see
   [Updating the app](#updating-the-app)); after a minute the app is live at `https://YOUR-GITHUB-USERNAME.github.io/home-together/`.
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
  The anon key in `config.js` can't get around that. Files (receipts, tickets, dog photos) are in a private
  storage bucket with the same rule, and open through links that expire.
- **No connection:** changes are kept on the phone and sent when the connection is back; the header shows how many are waiting.
- **Shopping:** three parts. **List** for groceries, with your most-bought items as one-tap suggestions.
  Each item can say which supermarket it's from (or any shop); tap a shop at the top to see just its items, and the
  app remembers the usual shop for each item.
  **Needs** for bigger things (furniture, a TV, books) by category. **Past shops**: *Finish shopping* keeps what was
  in the basket together, with the store, total and receipt photos or PDFs.
- **Calendar:** plans can repeat (weekly, monthly, yearly), remind you the evening before or an hour before, and carry
  files such as plane tickets, boarding passes (also Wallet passes) and bookings. Use the **Travel** category for trips.
- **Chores:** each one can be for anyone, for one person, or take turns; Today shows whose turn it is.
- **Dogs:** a profile per dog (photo, age, breed, weight, food, vet, chip, health). One tap logs a walk or a meal and
  tells your partner. Each dog has its own medicines with dose, how often and a reminder time; both phones get a
  reminder when one is due, and **Given** tells your partner which dog got what.
- **Walks from an iPhone Shortcut:** Settings has a personal link for the Shortcuts app, for example to log a walk when
  you leave home. iPhone doesn't let apps see AirTags, so this is the closest thing to automatic.
- **Spending:** a tab with each month's total (and the change from last month), what each of you paid, bars per
  category, totals per shop (Amazon, IKEA, Mercadona…; any new shop typed is remembered), and every expense with its
  receipt. *Finish shopping* with a total adds a Groceries expense; ticking off a Need adds it with its price, shop and
  category (it asks for the price if there isn't one). **Fixed monthly costs** (rent, bills, subscriptions) are added on
  their day by the morning job. Tap a category to set a **monthly budget**: the bar turns amber at 80% and red when over,
  and both phones get a notification once per level each month. Expenses marked **Only me** are visible only to whoever
  added them (enforced by the database) and don't count towards the shared budget notifications. **Download for Excel**
  gives the month or the year as a CSV file.
- **Text size:** the app follows the iPhone text size setting.
- **Your data:** Settings → *Download a copy* saves everything in the home as a file.

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
Each release needs at least one new merged change since the previous one: GitHub Pages skips a deploy for a commit
it has already published, so two releases on the same commit leave the older version online.
The current version is shown at the bottom of **⚙ Settings**.

- **Change a function:** after editing a file in `supabase/functions`, run the matching `npx supabase functions deploy ...` command again.

## Backups

Every Sunday at 13:00 the PC saves a full copy into **OneDrive → Home Together backups → (date)**:
`data.json` with everything in the app, and `files/` with receipts, tickets and dog photos. The last 8 are kept.
If the PC is off on Sunday, it runs the next time it's on and connected.

- It reads through the `backup` function, which can only read, never change anything. Its key (`BACKUP_SECRET`) is
  stored in `%LOCALAPPDATA%\HomeTogetherBackup\key.txt`, encrypted by Windows so it only works for your user on this PC.
- Each run adds a line to `%LOCALAPPDATA%\HomeTogetherBackup\backup.log` (OK or FAILED with the reason).
- See or change it in **Task Scheduler → Home Together backup**. To run one now:
  `Start-ScheduledTask -TaskName "Home Together backup"`.
- `backup/backup.ps1` in this folder is the script that is installed there.

## Files

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js`, `i18n.js` | The app |
| `config.js` | Your Supabase and notification keys (public ones only) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Home-screen install, offline shell and notifications |
| `supabase/schema.sql` | Database tables and security rules (run once) |
| `supabase/functions/notify` | Sends "your partner added…" notifications |
| `supabase/functions/daily` | Sends the morning reminder |
| `supabase/functions/remind` | Reminders before plans, and dog medicines when due |
| `supabase/functions/walk` | Logs a dog walk from an iPhone Shortcut |
| `supabase/functions/backup` | Read-only export used by the weekly PC backup |
| `backup/backup.ps1` | The weekly backup script (installed in `%LOCALAPPDATA%\HomeTogetherBackup`) |
| `supabase/migrations/` | Database changes, applied with `npx supabase db push` |
| `supabase/daily-reminder.sql` | Schedules the morning reminder |
| `supabase/reminders.sql` | Schedules the 15-minute reminder check |
| `version.json`, `.github/workflows/` | Release version and the workflows that check and publish the app |
