-- =====================================================================
-- Dog food and other supplies that run out, papers with expiry dates,
-- the home info card, and a log of who did which chore.
-- =====================================================================

-- A bag of food (or anything used up at a steady pace). It runs out on opened_on + size / per_day.
-- The daily function adds it to the shopping list warn_days before; alerted_on remembers it did, for this bag.
create table public.dog_supplies (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  dog_id       uuid references public.dogs(id) on delete cascade,   -- null = all the dogs
  name         text not null,
  size         numeric(10,2) not null check (size > 0),
  per_day      numeric(10,3) not null check (per_day > 0),
  unit         text not null default 'kg',
  opened_on    date not null default current_date,
  warn_days    int  not null default 5 check (warn_days between 0 and 60),
  alerted_on   date,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

-- Medicines: set once the daily function has put a running-low medicine on the shopping list (cleared on refill).
alter table public.dog_meds add column low_alerted boolean not null default false;

-- Papers: vaccines, insurance, ID cards, ITV, contracts… for a dog or for the home.
-- reminded: 0 nothing sent yet, 1 heads-up sent (remind_days before), 2 told on the day it expires.
create table public.papers (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  dog_id       uuid references public.dogs(id) on delete cascade,   -- null = the home
  title        text not null,
  expires_on   date,
  remind_days  int  not null default 14 check (remind_days between 0 and 365),
  notes        text not null default '',
  reminded     int  not null default 0,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

-- Home info card: Wi-Fi, phone numbers, codes…
create table public.home_info (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  label        text not null,
  value        text not null default '',
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

-- One row each time a chore or to-do is done, for "who did what". Kept when the chore is deleted.
create table public.chore_log (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  chore_id     uuid references public.chores(id) on delete set null,
  title        text not null default '',
  by_user      uuid default auth.uid(),
  at           timestamptz not null default now()
);
create index chore_log_recent on public.chore_log (household_id, at desc);

do $$
declare t text;
begin
  foreach t in array array['dog_supplies', 'papers', 'home_info', 'chore_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "household access" on public.%I for all
                    using (household_id = public.my_household())
                    with check (household_id = public.my_household())', t);
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;
alter publication supabase_realtime add table public.dog_supplies, public.papers, public.home_info, public.chore_log;

-- Scans of papers can be attached too.
alter table public.attachments
  drop constraint attachments_one_parent,
  add column paper_id uuid references public.papers(id) on delete cascade,
  add constraint attachments_one_parent check (num_nonnulls(event_id, trip_id, expense_id, paper_id) = 1);

-- Who did what in [p_from, p_to): chores, walks, meals and medicines, shops, and shared spending paid.
-- Runs with the caller's rights, so it only ever counts their own home (and nobody's private expenses).
create or replace function public.home_stats(p_from date, p_to date)
returns table (user_id uuid, kind text, n bigint, amount numeric)
language sql stable security invoker set search_path = public as $$
  select by_user, 'chore', count(*), null::numeric from public.chore_log
    where household_id = public.my_household() and at >= p_from and at < p_to group by 1
  union all
  select by_user, kind, count(*), null from public.dog_log
    where household_id = public.my_household() and at >= p_from and at < p_to group by 1, 2
  union all
  select created_by, 'trip', count(*), null from public.shopping_trips
    where household_id = public.my_household() and created_at >= p_from and created_at < p_to group by 1
  union all
  select paid_by, 'paid', count(*), sum(amount) from public.expenses
    where household_id = public.my_household() and not private and spent_on >= p_from and spent_on < p_to group by 1
$$;
grant execute on function public.home_stats(date, date) to authenticated;
