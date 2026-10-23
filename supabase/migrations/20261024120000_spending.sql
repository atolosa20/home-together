-- =====================================================================
-- Spending: expenses, fixed monthly costs, budgets per category.
-- "private" rows are visible only to the person who added them.
-- =====================================================================

-- Fixed monthly costs (rent, electricity, subscriptions). The daily function adds each one as an
-- expense on its day of the month; last_month remembers the last month it was added.
create table public.fixed_costs (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  name         text not null,
  amount       numeric(10,2) not null check (amount >= 0),
  cat          text not null default 'bills',
  day          int  not null check (day between 1 and 31),
  paid_by      uuid references auth.users(id) on delete set null,
  private      boolean not null default false,
  active       boolean not null default true,
  start_month  date not null default date_trunc('month', current_date)::date,
  last_month   date,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  amount       numeric(10,2) not null check (amount >= 0),
  cat          text not null default 'other',
  spent_on     date not null default current_date,
  paid_by      uuid references auth.users(id) on delete set null,
  note         text not null default '',
  store        text not null default '',
  private      boolean not null default false,
  trip_id      uuid references public.shopping_trips(id) on delete set null,
  need_id      uuid references public.needs(id) on delete set null,
  fixed_id     uuid references public.fixed_costs(id) on delete set null,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index expenses_month on public.expenses (household_id, spent_on);

create table public.budgets (
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  cat          text not null,
  amount       numeric(10,2) not null check (amount > 0),
  primary key (household_id, cat)
);

-- Budget notifications already sent (80% and 100%), once per category per month. Server only.
create table public.budget_alerts (
  household_id uuid not null references public.households(id) on delete cascade,
  cat          text not null,
  month        date not null,
  level        int  not null,
  sent_at      timestamptz not null default now(),
  primary key (household_id, cat, month, level)
);

alter table public.fixed_costs   enable row level security;
alter table public.expenses      enable row level security;
alter table public.budgets       enable row level security;
alter table public.budget_alerts enable row level security;

-- Shared rows: everyone in the home. Private rows: only whoever added them.
do $$
declare t text;
begin
  foreach t in array array['expenses', 'fixed_costs'] loop
    execute format('create policy "see shared or own" on public.%I for select
                    using (household_id = public.my_household() and (not private or created_by = auth.uid()))', t);
    execute format('create policy "add own" on public.%I for insert
                    with check (household_id = public.my_household() and created_by = auth.uid())', t);
    execute format('create policy "change shared or own" on public.%I for update
                    using (household_id = public.my_household() and (not private or created_by = auth.uid()))
                    with check (household_id = public.my_household() and (not private or created_by = auth.uid()))', t);
    execute format('create policy "delete shared or own" on public.%I for delete
                    using (household_id = public.my_household() and (not private or created_by = auth.uid()))', t);
  end loop;
end $$;
create policy "household access" on public.budgets for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());

alter table public.expenses    replica identity full;
alter table public.fixed_costs replica identity full;
alter table public.budgets     replica identity full;
alter publication supabase_realtime add table public.expenses, public.fixed_costs, public.budgets;

-- Receipts can also be attached to an expense: replace the "plan or shop" rule with "exactly one parent".
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.attachments'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%event_id%' and pg_get_constraintdef(oid) like '%trip_id%';
  if c is not null then execute format('alter table public.attachments drop constraint %I', c); end if;
end $$;
alter table public.attachments
  add column expense_id uuid references public.expenses(id) on delete cascade,
  add constraint attachments_one_parent check (num_nonnulls(event_id, trip_id, expense_id) = 1);

-- Needs: where to buy it (a shop or a website such as Amazon). Used when it goes into Spending.
alter table public.needs add column store text not null default '';
