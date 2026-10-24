-- =====================================================================
-- Fixed costs that repeat every few months and remind before they are charged,
-- dog weights over time, vet visits with their cost, and shared notes.
-- =====================================================================

-- Fixed costs: charged every N months from start_month (1 = monthly, 12 = yearly).
-- remind_days before each charge the morning notification mentions it (0 = never);
-- reminded_for is the charge date already mentioned, so it is said once.
alter table public.fixed_costs
  add column every_months int  not null default 1 check (every_months in (1, 2, 3, 6, 12)),
  add column remind_days  int  not null default 3 check (remind_days between 0 and 30),
  add column reminded_for date;

-- A dog's weight on a day. The latest one is also copied to dogs.weight by the app.
create table public.dog_weights (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  dog_id       uuid not null references public.dogs(id) on delete cascade,
  kg           numeric(5,2) not null check (kg > 0 and kg < 200),
  on_date      date not null default current_date,
  by_user      uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index dog_weights_dog on public.dog_weights (dog_id, on_date);

-- Shared notes: gift ideas, restaurants to try, packing lists… Lines written "[ ] …" become ticks.
create table public.notes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  title        text not null default '',
  body         text not null default '',
  pinned       boolean not null default false,
  updated_by   uuid default auth.uid(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['dog_weights', 'notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "household access" on public.%I for all
                    using (household_id = public.my_household())
                    with check (household_id = public.my_household())', t);
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;
alter publication supabase_realtime add table public.dog_weights, public.notes;

-- What a vet visit (or any dog appointment in the calendar) cost.
alter table public.expenses add column event_id uuid references public.events(id) on delete set null;

-- Notifications each person turned off in Settings (topics: list, shop, need, calendar, chores, done,
-- dogs, med, note, reminders, meds_due, budget, daily, weekly). Everyone gets everything by default.
alter table public.members add column notify_off text[] not null default '{}';
