-- =====================================================================
-- Home Together — database setup for Supabase
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run once on a fresh project.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- households and members ----------
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Our Home',
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)),
  created_at  timestamptz not null default now()
);

create table public.members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null default '',
  lang         text not null default 'en' check (lang in ('en','es')),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- The household of the signed-in user (each person belongs to one home).
create or replace function public.my_household()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from public.members where user_id = auth.uid()
$$;

-- ---------- shared data ----------
create table public.groceries (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  name         text not null,
  qty          text not null default '',
  cat          text not null default 'other',
  done         boolean not null default false,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

create table public.chores (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  title        text not null,
  key          text,                         -- set for starter chores so their title can be translated
  every        int  not null default 0,      -- 0 = one-off to-do, otherwise repeat every N days
  dog          boolean not null default false,
  start_date   date not null default current_date,
  last_done    date,
  last_by      uuid,
  done         boolean not null default false,
  done_by      uuid,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  title        text not null,
  date         date not null,
  time         text not null default '',
  cat          text not null default 'home',
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

create table public.dogs (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  name         text not null,
  breed        text not null default '',
  birthday     date,
  notes        text not null default '',
  created_at   timestamptz not null default now()
);


create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now()
);

-- ---------- security: everyone only sees their own home ----------
alter table public.households         enable row level security;
alter table public.members            enable row level security;
alter table public.groceries          enable row level security;
alter table public.chores             enable row level security;
alter table public.events             enable row level security;
alter table public.dogs               enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "read own household"   on public.households for select using (id = public.my_household());
create policy "rename own household" on public.households for update using (id = public.my_household()) with check (id = public.my_household());

create policy "read housemates"      on public.members for select using (household_id = public.my_household());
create policy "edit own member row"  on public.members for update using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['groceries','chores','events','dogs'] loop
    execute format('create policy "household access" on public.%I for all
                    using (household_id = public.my_household())
                    with check (household_id = public.my_household())', t);
  end loop;
end $$;

create policy "own subscriptions" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- create / join a home ----------
create or replace function public.create_household(home_name text, my_name text, my_lang text default 'en')
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'already in a home'; end if;
  insert into households(name) values (coalesce(nullif(trim(home_name), ''), 'Our Home')) returning id into hid;
  insert into members(household_id, user_id, display_name, lang) values (hid, auth.uid(), trim(my_name), coalesce(my_lang, 'en'));
  insert into chores(household_id, title, key, every, dog, start_date, created_by) values
    (hid, 'Laundry',                          'laundry',  3,  false, current_date,      auth.uid()),
    (hid, 'Change the bed sheets',            'sheets',   14, false, current_date + 2,  auth.uid()),
    (hid, 'Clean the bathroom',               'bathroom', 7,  false, current_date + 1,  auth.uid()),
    (hid, 'Wash the dogs'' beds and blankets', 'dogbeds',  14, true,  current_date + 3,  auth.uid()),
    (hid, 'Flea & tick treatment',            'fleas',    30, true,  current_date + 7,  auth.uid()),
    (hid, 'Deworming tablet',                 'worming',  90, true,  current_date + 7,  auth.uid());
  return hid;
end $$;

create or replace function public.join_household(code text, my_name text, my_lang text default 'en')
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'already in a home'; end if;
  select id into hid from households where invite_code = upper(trim(code));
  if hid is null then raise exception 'invalid code'; end if;
  insert into members(household_id, user_id, display_name, lang) values (hid, auth.uid(), trim(my_name), coalesce(my_lang, 'en'));
  return hid;
end $$;

grant execute on function public.create_household(text, text, text) to authenticated;
grant execute on function public.join_household(text, text, text)   to authenticated;

-- ---------- live sync ----------
alter table public.groceries replica identity full;
alter table public.chores    replica identity full;
alter table public.events    replica identity full;
alter table public.dogs      replica identity full;
alter table public.households replica identity full;

alter publication supabase_realtime add table
  public.groceries, public.chores, public.events, public.dogs, public.households;
