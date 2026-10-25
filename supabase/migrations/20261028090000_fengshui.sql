-- =====================================================================
-- Feng shui: what the home's study says for each bagua zone (notes) and what to do (tasks),
-- and documents kept for a whole section of the app (the report, the plan…).
-- The text lives here, per home, not in the app's (public) code.
-- =====================================================================

-- zone: trueno, viento, fuego, tierra, lago, cielo, agua, montana, centro, or "personal" / "general".
create table public.fengshui (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  zone         text not null,
  kind         text not null default 'task' check (kind in ('task', 'note')),
  text         text not null,
  done         boolean not null default false,
  done_by      uuid,
  sort         int  not null default 0,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
alter table public.fengshui enable row level security;
create policy "household access" on public.fengshui for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());
alter table public.fengshui replica identity full;
alter publication supabase_realtime add table public.fengshui;

-- Files that belong to a section rather than to one item (for now only 'fengshui').
alter table public.attachments
  drop constraint attachments_one_parent,
  add column section text check (section in ('fengshui')),
  add constraint attachments_one_parent check (num_nonnulls(event_id, trip_id, expense_id, paper_id, section) = 1);
