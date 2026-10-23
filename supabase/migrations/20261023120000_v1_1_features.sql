-- =====================================================================
-- Repeating plans, reminders before a plan, whose turn a chore is,
-- and shopping suggestions. Applied with `npx supabase db push`.
-- =====================================================================

-- ---------- calendar: repeat and remind ----------
alter table public.events
  add column repeat text not null default '' check (repeat in ('', 'week', 'month', 'year')),
  add column remind text not null default '' check (remind in ('', 'day', 'hour'));

-- Which reminders went out, so each one is sent once. Only the server uses it (no policies).
create table public.event_reminders (
  event_id uuid not null references public.events(id) on delete cascade,
  on_date  date not null,
  kind     text not null,
  sent_at  timestamptz not null default now(),
  primary key (event_id, on_date, kind)
);
alter table public.event_reminders enable row level security;

-- ---------- chores: who does it ----------
-- assigned_to: always this person. rotate: alternate between the people in the home.
alter table public.chores
  add column assigned_to uuid references auth.users(id) on delete set null,
  add column rotate boolean not null default false;

-- ---------- shopping: what you buy often ----------
create table public.grocery_history (
  household_id uuid not null references public.households(id) on delete cascade,
  name_key     text not null,             -- lower-case name, so "Milk" and "milk" count together
  name         text not null,
  cat          text not null default 'other',
  uses         int  not null default 1,
  last_used    timestamptz not null default now(),
  primary key (household_id, name_key)
);
alter table public.grocery_history enable row level security;
create policy "read own history"   on public.grocery_history for select using (household_id = public.my_household());
create policy "forget own history" on public.grocery_history for delete using (household_id = public.my_household());

create or replace function public.remember_grocery()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into grocery_history(household_id, name_key, name, cat)
  values (new.household_id, lower(trim(new.name)), trim(new.name), new.cat)
  on conflict (household_id, name_key) do update
    set uses = grocery_history.uses + 1, name = excluded.name, cat = excluded.cat, last_used = now();
  return new;
end $$;

create trigger groceries_remember after insert on public.groceries
  for each row execute function public.remember_grocery();

-- Start the history from what is on the lists today.
insert into public.grocery_history(household_id, name_key, name, cat, uses)
select household_id, lower(trim(name)), min(trim(name)), min(cat), count(*)
from public.groceries group by household_id, lower(trim(name))
on conflict do nothing;

-- ---------- shopping trips: what was bought together, with the receipt ----------
create table public.shopping_trips (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  store        text not null default '',
  total        text not null default '',     -- as typed, e.g. "54,30"
  items        jsonb not null default '[]',  -- [{ name, qty, cat }]
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

-- ---------- needs: bigger things to buy (TV, books, furniture…) ----------
create table public.needs (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  title        text not null,
  cat          text not null default 'other',
  price        text not null default '',
  link         text not null default '',
  notes        text not null default '',
  done         boolean not null default false,
  done_by      uuid,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

alter table public.shopping_trips enable row level security;
alter table public.needs          enable row level security;
create policy "household access" on public.shopping_trips for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());
create policy "household access" on public.needs for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());

alter table public.shopping_trips replica identity full;
alter table public.needs          replica identity full;
alter publication supabase_realtime add table public.shopping_trips, public.needs;

-- ---------- files: receipts on shopping trips, tickets and bookings on calendar plans ----------
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  event_id     uuid references public.events(id) on delete cascade,
  trip_id      uuid references public.shopping_trips(id) on delete cascade,
  path         text not null unique,   -- in the "files" storage bucket: <household id>/...
  name         text not null,
  mime         text not null default '',
  size         int  not null default 0,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  check ((event_id is null) <> (trip_id is null))
);
alter table public.attachments enable row level security;
create policy "household access" on public.attachments for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());
alter table public.attachments replica identity full;
alter publication supabase_realtime add table public.attachments;

-- Private bucket; each home's files live under "<household id>/" and only that home can use them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 10485760, array[
  'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'image/gif',
  'application/pdf', 'application/vnd.apple.pkpass'])
on conflict (id) do nothing;

create policy "files: read own home" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = public.my_household()::text);
create policy "files: add to own home" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = public.my_household()::text);
create policy "files: replace in own home" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = public.my_household()::text);
create policy "files: delete in own home" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = public.my_household()::text);

-- ---------- dogs: full profile ----------
alter table public.dogs
  add column photo     text,                       -- path in the "files" bucket
  add column sex       text not null default '',   -- '', 'f', 'm'
  add column weight    text not null default '',
  add column food      text not null default '',   -- what and how much
  add column vet       text not null default '',   -- name and phone
  add column chip      text not null default '',   -- microchip number
  add column health    text not null default '';   -- allergies, medicines

-- ---------- dogs: walks and meals ----------
create table public.dog_log (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  kind         text not null check (kind in ('walk', 'food')),
  by_user      uuid default auth.uid(),
  at           timestamptz not null default now()
);
create index dog_log_recent on public.dog_log (household_id, at desc);
alter table public.dog_log enable row level security;
create policy "household access" on public.dog_log for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());
alter table public.dog_log replica identity full;
alter publication supabase_realtime add table public.dog_log;

-- ---------- iPhone Shortcut: log a walk without opening the app ----------
-- Each person can make one personal link. It can only log a walk for their own home.
create table public.shortcut_tokens (
  token      text primary key,
  user_id    uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.shortcut_tokens enable row level security;
create policy "own token" on public.shortcut_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- dogs: medicines, one list per dog ----------
create table public.dog_meds (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  dog_id       uuid not null references public.dogs(id) on delete cascade,
  name         text not null,
  dose         text not null default '',
  every        int  not null default 0,     -- days between doses; 0 = when needed
  start_date   date not null default current_date,
  last_given   date,
  last_by      uuid,
  created_at   timestamptz not null default now()
);
alter table public.dog_meds enable row level security;
create policy "household access" on public.dog_meds for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());
alter table public.dog_meds replica identity full;
alter publication supabase_realtime add table public.dog_meds;

-- The log also records medicines, for which dog, and what was given.
alter table public.dog_log
  drop constraint dog_log_kind_check,
  add constraint dog_log_kind_check check (kind in ('walk', 'food', 'med')),
  add column dog_id uuid references public.dogs(id) on delete cascade,
  add column detail text not null default '';

-- Medicine reminders: at this time on each due day until it is given. stock: doses left (optional).
alter table public.dog_meds
  add column at_time text not null default '09:00',
  add column stock   int check (stock is null or stock >= 0);

create table public.med_reminders (
  med_id  uuid not null references public.dog_meds(id) on delete cascade,
  on_date date not null,
  sent_at timestamptz not null default now(),
  primary key (med_id, on_date)
);
alter table public.med_reminders enable row level security;  -- only the server uses it
