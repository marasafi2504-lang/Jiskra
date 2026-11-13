-- =====================================================================
-- Jiskra v4 – Boost Coiny (virtuální měna)
--   Boost 500 · Super Like navíc 100 · Odhalit lajk 150 · Vrácení swipu 50
--   Balíčky (Google Play, spotřební produkty): jiskra_coins_1000 / 2500 / 5000 / 10000
--   Odměna: 500 coinů za schválené ověření profilu (jednou)
-- Spouštět přes SQL editor; skript nic nemaže.
-- =====================================================================

create table if not exists public.wallets (
  user_id    uuid primary key references public.profiles on delete cascade,
  coins      int not null default 0 check (coins >= 0),
  updated_at timestamptz not null default now()
);
alter table public.wallets enable row level security;
do $$ begin
  create policy "own wallet select" on public.wallets for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create table if not exists public.coin_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  delta      int not null,
  reason     text not null,
  ref        text unique,
  created_at timestamptz not null default now()
);
create index if not exists coin_ledger_user_idx on public.coin_ledger (user_id, created_at desc);
alter table public.coin_ledger enable row level security;
do $$ begin
  create policy "own ledger select" on public.coin_ledger for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create table if not exists public.revealed_likes (
  user_id    uuid not null references public.profiles on delete cascade,
  liker      uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, liker)
);
alter table public.revealed_likes enable row level security;
do $$ begin
  create policy "own reveals select" on public.revealed_likes for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- placené boosty se nepočítají do měsíčního limitu z předplatného
alter table public.boosts add column if not exists paid boolean not null default false;

-- ---------- ceník (jediné místo pravdy) ----------
create or replace function public.coin_price(item text) returns int
language sql immutable as $$
  select case item when 'boost' then 500 when 'super' then 100 when 'reveal' then 150 when 'rewind' then 50 end
$$;

-- ---------- interní pohyb coinů (jen pro server) ----------
create or replace function public.coins_add(uid uuid, delta int, reason text, ref text default null)
returns int language plpgsql security definer set search_path = public as $$
declare bal int;
begin
  if delta = 0 then raise exception 'bad_amount'; end if;
  insert into wallets (user_id) values (uid) on conflict do nothing;
  if ref is not null and exists (select 1 from coin_ledger l where l.ref = coins_add.ref) then
    return (select coins from wallets where user_id = uid);
  end if;
  begin
    update wallets set coins = coins + delta, updated_at = now() where user_id = uid returning coins into bal;
  exception when check_violation then
    raise exception 'not_enough_coins';
  end;
  insert into coin_ledger (user_id, delta, reason, ref) values (uid, delta, reason, ref);
  return bal;
end $$;
revoke execute on function public.coins_add(uuid, int, text, text) from public, anon, authenticated;
grant execute on function public.coins_add(uuid, int, text, text) to service_role;

create or replace function public.my_coins() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select coins from wallets where user_id = auth.uid()), 0)
$$;

create or replace function public.my_coin_history()
returns table (delta int, reason text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select delta, reason, created_at from coin_ledger where user_id = auth.uid() order by created_at desc limit 30
$$;

-- ---------- Boost ----------
create or replace function public.use_boost() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  p text := current_plan(auth.uid());
  used int; allowed int; ends timestamptz;
begin
  if (select boost_until from profiles where id = auth.uid()) > now() then raise exception 'boost_active'; end if;
  allowed := case p when 'platinum' then 3 when 'gold' then 1 else 0 end;
  select count(*) into used from boosts where user_id = auth.uid() and not paid and started_at > now() - interval '30 days';
  if used >= allowed then raise exception 'boost_unavailable'; end if;
  ends := now() + interval '30 minutes';
  insert into boosts (user_id, ends_at) values (auth.uid(), ends);
  perform set_config('jiskra.bypass', 'on', true);
  update profiles set boost_until = ends where id = auth.uid();
  return ends;
end $$;

create or replace function public.boost_with_coins() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare ends timestamptz;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid() and not banned) then raise exception 'forbidden'; end if;
  if (select boost_until from profiles where id = auth.uid()) > now() then raise exception 'boost_active'; end if;
  perform coins_add(auth.uid(), -coin_price('boost'), 'boost');
  ends := now() + interval '30 minutes';
  insert into boosts (user_id, ends_at, paid) values (auth.uid(), ends, true);
  perform set_config('jiskra.bypass', 'on', true);
  update profiles set boost_until = ends where id = auth.uid();
  return ends;
end $$;

create or replace function public.boost_status()
returns table (active_until timestamptz, used int, allowed int)
language sql stable security definer set search_path = public as $$
  select (select case when boost_until > now() then boost_until end from profiles where id = auth.uid()),
         (select count(*)::int from boosts where user_id = auth.uid() and not paid and started_at > now() - interval '30 days'),
         case current_plan(auth.uid()) when 'platinum' then 3 when 'gold' then 1 else 0 end
$$;

-- ---------- Super Like za coiny ----------
create or replace function public.check_swipe_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p text := current_plan(new.swiper);
  n int;
begin
  if exists (select 1 from profiles where id = new.swiper and banned) then raise exception 'banned'; end if;
  if new.kind = 'like' and p is null then
    select count(*) into n from swipes
      where swiper = new.swiper and kind in ('like','super') and created_at > now() - interval '24 hours';
    if n >= 50 then raise exception 'like_limit'; end if;
  elsif new.kind = 'super' and coalesce(current_setting('jiskra.coin_super', true), '') <> 'on' then
    select count(*) into n from swipes
      where swiper = new.swiper and kind = 'super' and created_at > now() - interval '7 days';
    if n >= (case when p in ('gold','platinum') then 5 else 1 end) then raise exception 'super_limit'; end if;
  end if;
  return new;
end $$;

create or replace function public.super_like_with_coins(pid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or pid = auth.uid() then raise exception 'forbidden'; end if;
  if blocked_between(auth.uid(), pid) then raise exception 'blocked'; end if;
  perform coins_add(auth.uid(), -coin_price('super'), 'super');
  perform set_config('jiskra.coin_super', 'on', true);
  insert into swipes (swiper, swipee, kind) values (auth.uid(), pid, 'super');
  perform set_config('jiskra.coin_super', 'off', true);
end $$;

-- ---------- Vrácení swipu za coiny ----------
create or replace function public.rewind_with_coins(pid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if current_plan(auth.uid()) is null then
    perform coins_add(auth.uid(), -coin_price('rewind'), 'rewind');
  end if;
  delete from swipes where swiper = auth.uid() and swipee = pid;
  if not found then raise exception 'nothing_to_rewind'; end if;
end $$;

-- ---------- Odhalit lajk za coiny ----------
create or replace function public.reveal_like() returns uuid
language plpgsql security definer set search_path = public as $$
declare who uuid;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if coalesce(current_plan(auth.uid()), '') in ('gold','platinum') then raise exception 'already_gold'; end if;
  select s.swiper into who from swipes s join profiles p on p.id = s.swiper
  where s.swipee = auth.uid() and s.kind in ('like','super') and not p.banned
    and not blocked_between(s.swiper, auth.uid())
    and not exists (select 1 from swipes x where x.swiper = auth.uid() and x.swipee = s.swiper)
    and not exists (select 1 from revealed_likes r where r.user_id = auth.uid() and r.liker = s.swiper)
  order by (s.kind = 'super') desc, s.created_at desc limit 1;
  if who is null then raise exception 'nothing_to_reveal'; end if;
  perform coins_add(auth.uid(), -coin_price('reveal'), 'reveal');
  insert into revealed_likes (user_id, liker) values (auth.uid(), who);
  return who;
end $$;

create or replace function public.revealed_likes_list()
returns table (id uuid, name text, age integer, photos text[], verified boolean, distance_km integer, compat integer, super_liked_me boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, age_of(p.birthdate),
         case when coalesce(array_length(p.photos,1),0) > 0 then p.photos
              when p.photo_url is not null then array[p.photo_url] else '{}'::text[] end,
         p.verified, dist_km(me.lat, me.lng, p.lat, p.lng), compat(me.personality, p.personality), s.kind = 'super'
  from revealed_likes r
  join swipes s on s.swiper = r.liker and s.swipee = r.user_id and s.kind in ('like','super')
  join profiles p on p.id = r.liker join profiles me on me.id = auth.uid()
  where r.user_id = auth.uid() and not p.banned and not blocked_between(p.id, auth.uid())
    and not exists (select 1 from swipes x where x.swiper = auth.uid() and x.swipee = r.liker)
  order by r.created_at desc
$$;

-- ---------- Odměna za ověření profilu ----------
create or replace function public.admin_verify(uid uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  perform set_config('jiskra.bypass', 'on', true);
  update profiles set verified = approve,
         verification_status = case when approve then 'approved' else 'rejected' end
  where id = uid;
  if approve then perform coins_add(uid, 500, 'verify_bonus', 'verify:' || uid::text); end if;
end $$;

revoke execute on function public.check_swipe_limits() from public, anon, authenticated;
