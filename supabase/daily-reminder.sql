-- =====================================================================
-- Morning reminder schedule. Run this AFTER deploying the functions (README step 6).
-- Replace the two placeholders first:
--   YOUR-PROJECT-REF  → the id in your Supabase URL (https://<this>.supabase.co)
--   YOUR-CRON-SECRET  → the same CRON_SECRET you set with `supabase secrets set`
-- The time is in UTC: 06:30 UTC = 08:30 in summer / 07:30 in winter in Spain.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'home-together-daily',
  '30 6 * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/daily',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000   -- the function can take a few seconds to start after a quiet spell
  );
  $$
);

-- To change the time later:   select cron.unschedule('home-together-daily');  then run this file again.
