-- =====================================================================
-- Weather for dog walks: the home's town (shared by everyone in it),
-- and each person's choice to be told before it rains.
-- =====================================================================

alter table public.households
  add column place text not null default '',
  add column lat   double precision,
  add column lon   double precision;

alter table public.members add column rain_alerts boolean not null default false;

-- Rain alerts already sent (one per home, day and start of the rain). Only the server uses it.
create table public.weather_alerts (
  household_id uuid not null references public.households(id) on delete cascade,
  on_date      date not null,
  starts       text not null,
  primary key (household_id, on_date, starts)
);
alter table public.weather_alerts enable row level security;
