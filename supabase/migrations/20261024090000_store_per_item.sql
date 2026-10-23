-- =====================================================================
-- Supermarket per shopping item ('' = any shop). The history remembers
-- the last shop used for each item, so suggestions keep it.
-- =====================================================================

alter table public.groceries       add column store text not null default '';
alter table public.grocery_history add column store text not null default '';

create or replace function public.remember_grocery()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into grocery_history(household_id, name_key, name, cat, store)
  values (new.household_id, lower(trim(new.name)), trim(new.name), new.cat, new.store)
  on conflict (household_id, name_key) do update
    set uses = grocery_history.uses + 1, name = excluded.name, cat = excluded.cat, last_used = now(),
        store = case when excluded.store <> '' then excluded.store else grocery_history.store end;
  return new;
end $$;
