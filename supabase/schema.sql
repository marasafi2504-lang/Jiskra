-- =====================================================================
-- Jiskra – databáze pro Supabase
-- Spusť celý soubor JEDNOU v Supabase: SQL Editor → New query → vložit → Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- PROFILY
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  birthdate    date not null,
  gender       text not null check (gender in ('muz','zena','jine')),
  looking_for  text not null check (looking_for in ('muze','zeny','vsechny')),
  bio          text not null default '' check (char_length(bio) <= 500),
  city         text not null default '' check (char_length(city) <= 60),
  job          text not null default '' check (char_length(job) <= 60),
  interests    text[] not null default '{}',
  photo_url    text,
  min_age      int not null default 18 check (min_age >= 18),
  max_age      int not null default 99 check (max_age <= 120),
  verified     boolean not null default false,   -- nastavuje jen admin
  created_at   timestamptz not null default now()
);

-- Ověření věku 18+ (trigger, protože CHECK nesmí používat current_date)
create or replace function public.check_adult() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.birthdate > (current_date - interval '18 years') then
    raise exception 'under_18';
  end if;
  if array_length(new.interests, 1) > 10 then
    raise exception 'too_many_interests';
  end if;
  -- "verified" smí měnit jen admin, ne uživatel z aplikace
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.verified := false;
    else
      new.verified := old.verified;
      new.id := old.id;
    end if;
  end if;
  return new;
end $$;

create trigger profiles_check_adult before insert or update on public.profiles
  for each row execute function public.check_adult();

alter table public.profiles enable row level security;

-- Uživatel vidí a mění jen svůj řádek; cizí profily jdou jen přes funkce níže
create policy "own profile select" on public.profiles for select using (id = auth.uid());
create policy "own profile insert" on public.profiles for insert with check (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid());

grant update (name, birthdate, gender, looking_for, bio, city, job, interests, photo_url, min_age, max_age)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- PŘEDPLATNÉ (zapisuje jen server – Stripe webhook)
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id          uuid primary key references public.profiles on delete cascade,
  plan             text not null check (plan in ('plus','gold','platinum')),
  valid_until      timestamptz not null,
  stripe_customer  text unique,
  stripe_sub       text unique,
  updated_at       timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy "own sub select" on public.subscriptions for select using (user_id = auth.uid());

create or replace function public.current_plan(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select plan from subscriptions where user_id = uid and valid_until > now()
$$;

-- ---------------------------------------------------------------------
-- SWIPY (lajk / přeskočit / super like)
-- ---------------------------------------------------------------------
create table if not exists public.swipes (
  swiper     uuid not null references public.profiles on delete cascade,
  swipee     uuid not null references public.profiles on delete cascade,
  kind       text not null check (kind in ('like','pass','super')),
  created_at timestamptz not null default now(),
  primary key (swiper, swipee),
  check (swiper <> swipee)
);
create index if not exists swipes_swipee_idx on public.swipes (swipee, kind);
alter table public.swipes enable row level security;

create policy "own swipes select" on public.swipes for select using (swiper = auth.uid());
create policy "own swipes insert" on public.swipes for insert with check (swiper = auth.uid());
-- Vrácení posledního swipu jen s předplatným
create policy "premium rewind" on public.swipes for delete
  using (swiper = auth.uid() and public.current_plan(auth.uid()) is not null);

-- Limity: zdarma 50 lajků / 24 h, Super Like 1 / týden (Gold a Platinum 5 / týden)
create or replace function public.check_swipe_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p text := current_plan(new.swiper);
  n int;
begin
  if new.kind = 'like' and p is null then
    select count(*) into n from swipes
      where swiper = new.swiper and kind in ('like','super')
        and created_at > now() - interval '24 hours';
    if n >= 50 then raise exception 'like_limit'; end if;
  elsif new.kind = 'super' then
    select count(*) into n from swipes
      where swiper = new.swiper and kind = 'super'
        and created_at > now() - interval '7 days';
    if n >= (case when p in ('gold','platinum') then 5 else 1 end) then
      raise exception 'super_limit';
    end if;
  end if;
  return new;
end $$;

create trigger swipes_limits before insert on public.swipes
  for each row execute function public.check_swipe_limits();

-- ---------------------------------------------------------------------
-- SHODY
-- ---------------------------------------------------------------------
create table if not exists public.matches (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references public.profiles on delete cascade,
  user_b     uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);
alter table public.matches enable row level security;
create policy "member match select" on public.matches for select
  using (auth.uid() in (user_a, user_b));
create policy "member match delete" on public.matches for delete
  using (auth.uid() in (user_a, user_b));

-- Vzájemný lajk → vznikne shoda
create or replace function public.create_match() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('like','super') and exists (
    select 1 from swipes
    where swiper = new.swipee and swipee = new.swiper and kind in ('like','super')
  ) then
    insert into matches (user_a, user_b)
    values (least(new.swiper, new.swipee), greatest(new.swiper, new.swipee))
    on conflict do nothing;
  end if;
  return new;
end $$;

create trigger swipes_match after insert on public.swipes
  for each row execute function public.create_match();

-- ---------------------------------------------------------------------
-- ZPRÁVY
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  match_id   uuid not null references public.matches on delete cascade,
  sender     uuid not null default auth.uid() references public.profiles on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_match_idx on public.messages (match_id, created_at);
alter table public.messages enable row level security;

create or replace function public.is_match_member(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from matches where id = m and auth.uid() in (user_a, user_b))
$$;

create policy "member messages select" on public.messages for select
  using (public.is_match_member(match_id));
create policy "member messages insert" on public.messages for insert
  with check (sender = auth.uid() and public.is_match_member(match_id));

-- ---------------------------------------------------------------------
-- NAHLÁŠENÍ
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  reporter   uuid not null default auth.uid() references public.profiles on delete cascade,
  reported   uuid not null references public.profiles on delete cascade,
  reason     text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
create policy "own report insert" on public.reports for insert with check (reporter = auth.uid());

-- ---------------------------------------------------------------------
-- FUNKCE PRO APLIKACI (vrací jen veřejné údaje, ne datum narození)
-- ---------------------------------------------------------------------
create or replace function public.age_of(d date) returns int
language sql stable as $$ select date_part('year', age(d))::int $$;

-- Kandidáti k swipování
create or replace function public.get_candidates(lim int default 20)
returns table (id uuid, name text, age int, bio text, city text, job text,
               interests text[], photo_url text, verified boolean, super_liked_me boolean)
language sql stable security definer set search_path = public as $$
  with me as (select * from profiles where id = auth.uid())
  select p.id, p.name, age_of(p.birthdate), p.bio, p.city, p.job, p.interests, p.photo_url, p.verified,
         exists (select 1 from swipes s where s.swiper = p.id and s.swipee = me.id and s.kind = 'super')
  from profiles p, me
  where p.id <> me.id
    and not exists (select 1 from swipes s where s.swiper = me.id and s.swipee = p.id)
    and (me.looking_for = 'vsechny'
         or (me.looking_for = 'muze' and p.gender = 'muz')
         or (me.looking_for = 'zeny' and p.gender = 'zena'))
    and (p.looking_for = 'vsechny'
         or (p.looking_for = 'muze' and me.gender = 'muz')
         or (p.looking_for = 'zeny' and me.gender = 'zena'))
    and age_of(p.birthdate) between me.min_age and me.max_age
    and age_of(me.birthdate) between p.min_age and p.max_age
  order by
    -- Platinum: tvoje lajky se zobrazí jako první
    (exists (select 1 from swipes s where s.swiper = p.id and s.swipee = me.id)
       and current_plan(p.id) = 'platinum') desc,
    (p.city = me.city) desc,
    random()
  limit least(lim, 50)
$$;

-- Moje shody + poslední zpráva
create or replace function public.my_matches()
returns table (match_id uuid, other_id uuid, name text, age int, photo_url text, verified boolean,
               last_body text, last_at timestamptz, last_from_me boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, p.id, p.name, age_of(p.birthdate), p.photo_url, p.verified,
         lm.body, lm.created_at, lm.sender = auth.uid(), m.created_at
  from matches m
  join profiles p on p.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
  left join lateral (
    select body, created_at, sender from messages where match_id = m.id
    order by created_at desc limit 1
  ) lm on true
  where auth.uid() in (m.user_a, m.user_b)
  order by coalesce(lm.created_at, m.created_at) desc
$$;

-- Počet lidí, kteří mě lajkli (zdarma vidí jen číslo)
create or replace function public.likes_me_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from swipes s
  where s.swipee = auth.uid() and s.kind in ('like','super')
    and not exists (select 1 from swipes x where x.swiper = auth.uid() and x.swipee = s.swiper)
$$;

-- Kdo mě lajkl (jen Gold a Platinum)
create or replace function public.likes_me()
returns table (id uuid, name text, age int, bio text, city text, job text,
               interests text[], photo_url text, verified boolean, super_liked_me boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(current_plan(auth.uid()), '') not in ('gold','platinum') then
    raise exception 'premium_required';
  end if;
  return query
    select p.id, p.name, age_of(p.birthdate), p.bio, p.city, p.job, p.interests, p.photo_url, p.verified,
           s.kind = 'super'
    from swipes s join profiles p on p.id = s.swiper
    where s.swipee = auth.uid() and s.kind in ('like','super')
      and not exists (select 1 from swipes x where x.swiper = auth.uid() and x.swipee = s.swiper)
    order by s.created_at desc;
end $$;

-- Smazání vlastního účtu (povinné pro Google Play a App Store)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- REALTIME (živý chat a nové shody)
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.matches;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- ÚLOŽIŠTĚ FOTEK (veřejný bucket, nahrávat jen do vlastní složky)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "upload own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "update own photos" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
