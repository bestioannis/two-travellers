-- Dedicated two-person travel atlas, run as the project owner.
begin;
create table if not exists public.travel_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slot smallint not null unique check (slot in (1, 2))
);
create table if not exists public.travel_places (
  place_id text collate "C" primary key check (char_length(place_id) between 1 and 240),
  status text not null check (status in ('visited', 'wish', 'deleted')),
  note text not null default '' check (char_length(note) <= 10000),
  date text not null default '' check (date = '' or date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  stamp text collate "C" not null check (stamp ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z_[0-9a-f-]{36}$')
);
alter table public.travel_members enable row level security;
alter table public.travel_places enable row level security;
revoke all on public.travel_members, public.travel_places from public, anon, authenticated;
grant select on public.travel_members, public.travel_places to authenticated;
drop policy if exists travel_members_read_self on public.travel_members;
create policy travel_members_read_self on public.travel_members for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists travel_places_read on public.travel_places;
create policy travel_places_read on public.travel_places for select to authenticated
  using (exists(select from public.travel_members where user_id = (select auth.uid())));

-- Writes have a single entry point. The fixed search path and membership
-- check apply even when a visitor calls PostgREST outside the application.
create or replace function public.travel_apply(changes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select from public.travel_members where user_id = (select auth.uid())) then
    raise insufficient_privilege using message = 'This account is not in the travel journal';
  end if;
  if jsonb_typeof(changes) is distinct from 'array' then
    raise exception 'Expected a JSON array';
  end if;
  if jsonb_array_length(changes) > 100 then
    raise exception 'At most 100 changes per request';
  end if;
  insert into public.travel_places as existing (place_id, status, note, date, stamp)
  select place_id, status, note, date, stamp from jsonb_to_recordset(changes)
    as incoming(place_id text, status text, note text, date text, stamp text)
  on conflict (place_id) do update set
    status = excluded.status, note = excluded.note, date = excluded.date, stamp = excluded.stamp
    where excluded.stamp > existing.stamp;
end $$;
revoke all on function public.travel_apply(jsonb) from public, anon, authenticated;
grant execute on function public.travel_apply(jsonb) to authenticated;
commit;
