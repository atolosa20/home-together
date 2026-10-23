-- =====================================================================
-- Reminders before a plan. Run this AFTER deploying the `remind` function.
-- Replace the two placeholders first, exactly as in daily-reminder.sql:
--   YOUR-PROJECT-REF  → the id in your Supabase URL (https://<this>.supabase.co)
--   YOUR-CRON-SECRET  → the same CRON_SECRET you set with `supabase secrets set`
-- It checks every 15 minutes whether a reminder is due.
-- =====================================================================

select cron.schedule(
  'home-together-remind',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/remind',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body    := '{}'::jsonb
  );
  $$
);

-- To stop it:   select cron.unschedule('home-together-remind');
