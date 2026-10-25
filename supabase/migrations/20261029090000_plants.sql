-- =====================================================================
-- Plants: where each one is (room and feng shui zone), how often it's watered (less in winter),
-- who watered it last, and whether it's safe for the dogs.
-- =====================================================================
create table public.plants (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  name         text not null,
  kind         text not null default '',          -- a plant from the app's list (spider, calathea…) or '' for another
  room         text not null default '',
  zone         text not null default '',          -- bagua zone, see the fengshui table
  photo        text,                              -- storage path in the "files" bucket
  water_every  int  not null default 7 check (water_every between 1 and 90),
  winter_every int  check (winter_every between 1 and 120),   -- November to March; null = same as the rest of the year
  last_watered date,
  last_by      uuid,
  dog_safe     boolean,                           -- for plants not in the app's list; null = not known
  notes        text not null default '',
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
alter table public.plants enable row level security;
create policy "household access" on public.plants for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());
alter table public.plants replica identity full;
alter publication supabase_realtime add table public.plants;
