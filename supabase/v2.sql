-- =====================================================================
-- Jiskra v2 – rozšíření databáze (spouští se jednou, po schema.sql)
-- fotky, prompty, osobnost, režim Láska/Přátelé, poloha, aktivita,
-- ověření selfie, admin, blokace, lepší chat, push notifikace
-- =====================================================================

-- ---------- PROFILY: nové sloupce ----------
alter table public.profiles
  add column if not exists photos text[] not null default '{}',
  add column if not exists prompts jsonb not null default '[]'::jsonb,
  add column if not exists personality text check (personality is null or personality ~ '^[EI][NS][TF][JP]$'),
  add column if not exists mode text not null default 'laska' check (mode in ('laska','pratele','oboje')),
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists max_distance_km int not null default 100 check (max_distance_km between 1 and 1000),
  add column if not exists last_active timestamptz not null default now(),
  add column if not exists verification_status text not null default 'none'
    check (verification_status in ('none','pending','approved','rejected')),
  add column if not exists verification_path text,
  add column if not exists is_admin boolean not null default false,
  add column if not exists banned boolean not null default false;

create index if not exists profiles_active_idx on public.profiles (last_active desc);

-- ---------- ZPRÁVY: nové sloupce ----------
alter table public.messages
  add column if not exists kind text not null default 'text' check (kind in ('text','image')),
  add column if not exists image_url text,
  add column if not exists read_at timestamptz,
  add column if not exists reaction text;

-- Ochrana profilu: 18+, limity, a citlivé sloupce smí měnit jen admin funkce
create or replace function public.check_adult() returns trigger
language plpgsql set search_path = public as $$
declare
  bypass boolean := coalesce(current_setting('jiskra.bypass', true), '') = 'on';
begin
  if new.birthdate > (current_date - interval '18 years') then
    raise exception 'under_18';
  end if;
  if coalesce(array_length(new.interests, 1), 0) > 10 then raise exception 'too_many_interests'; end if;
  if coalesce(array_length(new.photos, 1), 0) > 6 then raise exception 'too_many_photos'; end if;
  if jsonb_typeof(new.prompts) <> 'array' or jsonb_array_length(new.prompts) > 3 then raise exception 'too_many_prompts'; end if;

  -- přibližná poloha (~1 km), přesnou nikdy neukládáme
  if new.lat is not null then new.lat := round(new.lat::numeric, 2)::double precision; end if;
  if new.lng is not null then new.lng := round(new.lng::numeric, 2)::double precision; end if;

  -- hlavní fotka = první z galerie
  if coalesce(array_length(new.photos, 1), 0) > 0 then new.photo_url := new.photos[1]; end if;

  if not bypass and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.verified := false; new.is_admin := false; new.banned := false;
      new.verification_status := 'none';
    else
      new.id := old.id;
      new.verified := old.verified; new.is_admin := old.is_admin; new.banned := old.banned;
      -- uživatel smí jen požádat o ověření (none/rejected -> pending)
      if new.verification_status is distinct from old.verification_status
         and not (new.verification_status = 'pending' and old.verification_status in ('none','rejected')) then
        new.verification_status := old.verification_status;
      end if;
    end if;
  end if;
  return new;
end $$;

-- ---------- POMOCNÉ FUNKCE ----------
create or replace function public.is_admin(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = uid), false)
$$;

create or replace function public.dist_km(lat1 double precision, lng1 double precision,
                                          lat2 double precision, lng2 double precision)
returns int language sql immutable set search_path = public as $$
  select case when lat1 is null or lat2 is null or lng1 is null or lng2 is null then null
  else greatest(1, round(6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))::int) end
$$;

create or replace function public.zodiac_of(d date) returns text
language sql immutable set search_path = public as $$
  select case
    when (extract(month from d) = 3 and extract(day from d) >= 21) or (extract(month from d) = 4 and extract(day from d) <= 19) then 'Beran'
    when (extract(month from d) = 4) or (extract(month from d) = 5 and extract(day from d) <= 20) then 'Býk'
    when (extract(month from d) = 5) or (extract(month from d) = 6 and extract(day from d) <= 20) then 'Blíženci'
    when (extract(month from d) = 6) or (extract(month from d) = 7 and extract(day from d) <= 22) then 'Rak'
    when (extract(month from d) = 7) or (extract(month from d) = 8 and extract(day from d) <= 22) then 'Lev'
    when (extract(month from d) = 8) or (extract(month from d) = 9 and extract(day from d) <= 22) then 'Panna'
    when (extract(month from d) = 9) or (extract(month from d) = 10 and extract(day from d) <= 22) then 'Váhy'
    when (extract(month from d) = 10) or (extract(month from d) = 11 and extract(day from d) <= 21) then 'Štír'
    when (extract(month from d) = 11) or (extract(month from d) = 12 and extract(day from d) <= 21) then 'Střelec'
    when (extract(month from d) = 12) or (extract(month from d) = 1 and extract(day from d) <= 19) then 'Kozoroh'
    when (extract(month from d) = 1) or (extract(month from d) = 2 and extract(day from d) <= 18) then 'Vodnář'
    else 'Ryby' end
$$;

-- Kompatibilita osobností (16 typů) – 50 až 99 %
create or replace function public.compat(a text, b text) returns int
language sql immutable set search_path = public as $$
  select case when a is null or b is null then null else least(99,
    50
    + case when substr(a,2,1) = substr(b,2,1) then 25 else 0 end   -- N/S stejné
    + case when substr(a,1,1) <> substr(b,1,1) then 10 else 4 end  -- E/I doplňující se
    + case when substr(a,3,1) <> substr(b,3,1) then 8 else 5 end   -- T/F
    + case when substr(a,4,1) = substr(b,4,1) then 6 else 3 end    -- J/P
  ) end
$$;

-- Režim a pohlaví: shoda v "lásce" vyžaduje sedící pohlaví, "přátelé" ne
create or replace function public.modes_fit(m1 text, g1 text, l1 text, m2 text, g2 text, l2 text) returns boolean
language sql immutable set search_path = public as $$
  select
    ( m1 in ('pratele','oboje') and m2 in ('pratele','oboje') )
    or
    ( m1 in ('laska','oboje') and m2 in ('laska','oboje')
      and (l1 = 'vsechny' or (l1 = 'muze' and g2 = 'muz') or (l1 = 'zeny' and g2 = 'zena'))
      and (l2 = 'vsechny' or (l2 = 'muze' and g1 = 'muz') or (l2 = 'zeny' and g1 = 'zena')) )
$$;

-- ---------- OBJEVOVÁNÍ (nová verze) ----------
create or replace function public.discover(lim int default 20)
returns table (id uuid, name text, age int, bio text, city text, job text, interests text[],
               photos text[], prompts jsonb, personality text, zodiac text, mode text,
               verified boolean, distance_km int, compat int, active_recently boolean,
               super_liked_me boolean)
language sql stable security definer set search_path = public as $$
  with me as (select * from profiles where id = auth.uid() and not banned)
  select p.id, p.name, age_of(p.birthdate), p.bio, p.city, p.job, p.interests,
         case when coalesce(array_length(p.photos,1),0) > 0 then p.photos
              when p.photo_url is not null then array[p.photo_url] else '{}' end,
         p.prompts, p.personality, zodiac_of(p.birthdate), p.mode, p.verified,
         dist_km(me.lat, me.lng, p.lat, p.lng),
         compat(me.personality, p.personality),
         p.last_active > now() - interval '1 day',
         exists (select 1 from swipes s where s.swiper = p.id and s.swipee = me.id and s.kind = 'super')
  from profiles p, me
  where p.id <> me.id and not p.banned
    and not exists (select 1 from swipes s where s.swiper = me.id and s.swipee = p.id)
    and modes_fit(me.mode, me.gender, me.looking_for, p.mode, p.gender, p.looking_for)
    and age_of(p.birthdate) between me.min_age and me.max_age
    and age_of(me.birthdate) between p.min_age and p.max_age
    and (dist_km(me.lat, me.lng, p.lat, p.lng) is null
         or dist_km(me.lat, me.lng, p.lat, p.lng) <= least(me.max_distance_km, p.max_distance_km))
  order by
    (exists (select 1 from swipes s where s.swiper = p.id and s.swipee = me.id)
       and current_plan(p.id) = 'platinum') desc,
    (p.photo_url is not null) desc,
    (p.last_active > now() - interval '3 days') desc,
    coalesce(dist_km(me.lat, me.lng, p.lat, p.lng), 500) / 25,
    random()
  limit least(lim, 50)
$$;

-- Detail cizího profilu (jen pokud ho smím vidět: kandidát, shoda nebo mě lajknul)
create or replace function public.profile_card(pid uuid)
returns table (id uuid, name text, age int, bio text, city text, job text, interests text[],
               photos text[], prompts jsonb, personality text, zodiac text, mode text,
               verified boolean, distance_km int, compat int, active_recently boolean)
language sql stable security definer set search_path = public as $$
  with me as (select * from profiles where id = auth.uid())
  select p.id, p.name, age_of(p.birthdate), p.bio, p.city, p.job, p.interests,
         case when coalesce(array_length(p.photos,1),0) > 0 then p.photos
              when p.photo_url is not null then array[p.photo_url] else '{}' end,
         p.prompts, p.personality, zodiac_of(p.birthdate), p.mode, p.verified,
         dist_km(me.lat, me.lng, p.lat, p.lng), compat(me.personality, p.personality),
         p.last_active > now() - interval '1 day'
  from profiles p, me
  where p.id = pid and not p.banned
    and (exists (select 1 from matches m where m.user_a = least(me.id,p.id) and m.user_b = greatest(me.id,p.id))
         or exists (select 1 from swipes s where s.swiper = p.id and s.swipee = me.id)
         or modes_fit(me.mode, me.gender, me.looking_for, p.mode, p.gender, p.looking_for))
$$;

-- Kdo mě lajkl – rozšířená verze (Gold/Platinum)
create or replace function public.likes_me_full()
returns table (id uuid, name text, age int, photos text[], verified boolean, distance_km int,
               compat int, super_liked_me boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(current_plan(auth.uid()), '') not in ('gold','platinum') then
    raise exception 'premium_required';
  end if;
  return query
    select p.id, p.name, age_of(p.birthdate),
           case when coalesce(array_length(p.photos,1),0) > 0 then p.photos
                when p.photo_url is not null then array[p.photo_url] else '{}'::text[] end,
           p.verified, dist_km(me.lat, me.lng, p.lat, p.lng), compat(me.personality, p.personality),
           s.kind = 'super'
    from swipes s
    join profiles p on p.id = s.swiper
    join profiles me on me.id = auth.uid()
    where s.swipee = auth.uid() and s.kind in ('like','super') and not p.banned
      and not exists (select 1 from swipes x where x.swiper = auth.uid() and x.swipee = s.swiper)
    order by s.created_at desc;
end $$;

-- Shody v2: + aktivita, nepřečtené
create or replace function public.my_matches2()
returns table (match_id uuid, other_id uuid, name text, age int, photo_url text, verified boolean,
               active_recently boolean, last_body text, last_kind text, last_at timestamptz,
               last_from_me boolean, unread int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, p.id, p.name, age_of(p.birthdate), p.photo_url, p.verified,
         p.last_active > now() - interval '1 day',
         lm.body, lm.kind, lm.created_at, lm.sender = auth.uid(),
         (select count(*)::int from messages x where x.match_id = m.id and x.sender <> auth.uid() and x.read_at is null),
         m.created_at
  from matches m
  join profiles p on p.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
  left join lateral (
    select body, kind, created_at, sender from messages where match_id = m.id
    order by created_at desc limit 1
  ) lm on true
  where auth.uid() in (m.user_a, m.user_b) and not p.banned
  order by coalesce(lm.created_at, m.created_at) desc
$$;

-- Zablokovaný uživatel nesmí swipovat ani psát
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
  elsif new.kind = 'super' then
    select count(*) into n from swipes
      where swiper = new.swiper and kind = 'super' and created_at > now() - interval '7 days';
    if n >= (case when p in ('gold','platinum') then 5 else 1 end) then raise exception 'super_limit'; end if;
  end if;
  return new;
end $$;

-- ---------- CHAT v2 ----------

create or replace function public.check_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id = new.sender and banned) then raise exception 'banned'; end if;
  new.created_at := now(); new.read_at := null; new.reaction := null;
  if new.kind = 'image' and (new.image_url is null
     or new.image_url not like ('%/storage/v1/object/public/photos/' || new.sender::text || '/%')) then
    raise exception 'bad_image';
  end if;
  if new.kind = 'text' then new.image_url := null; end if;
  return new;
end $$;
create trigger messages_check before insert on public.messages
  for each row execute function public.check_message();

create or replace function public.mark_read(m uuid) returns void
language sql security definer set search_path = public as $$
  update messages set read_at = now()
  where match_id = m and sender <> auth.uid() and read_at is null and is_match_member(m)
$$;

create or replace function public.react(msg bigint, emoji text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if emoji is not null and emoji not in ('❤️','😂','😮','😢','🔥','👍') then raise exception 'bad_emoji'; end if;
  update messages set reaction = emoji
  where id = msg and sender <> auth.uid() and is_match_member(match_id);
end $$;

-- ---------- NAHLÁŠENÍ: vyřízení ----------
alter table public.reports add column if not exists resolved boolean not null default false;

-- ---------- OVĚŘENÍ SELFIE (soukromé úložiště) ----------
insert into storage.buckets (id, name, public) values ('verifications', 'verifications', false)
on conflict (id) do nothing;

create policy "upload own verification" on storage.objects for insert to authenticated
  with check (bucket_id = 'verifications' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own or admin verification" on storage.objects for select to authenticated
  using (bucket_id = 'verifications' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid())));

-- ---------- ADMIN ----------
create or replace function public.admin_stats()
returns table (users int, new_today int, active_today int, matches int, messages int,
               pending_verifications int, open_reports int, subscribers int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  return query select
    (select count(*)::int from profiles),
    (select count(*)::int from profiles where created_at > now() - interval '1 day'),
    (select count(*)::int from profiles where last_active > now() - interval '1 day'),
    (select count(*)::int from public.matches),
    (select count(*)::int from public.messages),
    (select count(*)::int from profiles where verification_status = 'pending'),
    (select count(*)::int from reports where not resolved),
    (select count(*)::int from subscriptions where valid_until > now());
end $$;

create or replace function public.admin_pending()
returns table (id uuid, name text, age int, photos text[], verification_path text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  return query select p.id, p.name, age_of(p.birthdate), p.photos, p.verification_path, p.created_at
    from profiles p where p.verification_status = 'pending' order by p.last_active desc;
end $$;

create or replace function public.admin_verify(uid uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  perform set_config('jiskra.bypass', 'on', true);
  update profiles set verified = approve,
         verification_status = case when approve then 'approved' else 'rejected' end
  where id = uid;
end $$;

create or replace function public.admin_reports()
returns table (id bigint, reason text, created_at timestamptz, reporter_name text,
               reported_id uuid, reported_name text, reported_photo text, reported_banned boolean, total_reports int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  return query select r.id, r.reason, r.created_at, a.name, b.id, b.name, b.photo_url, b.banned,
    (select count(*)::int from reports x where x.reported = b.id)
    from reports r join profiles a on a.id = r.reporter join profiles b on b.id = r.reported
    where not r.resolved order by r.created_at desc limit 200;
end $$;

create or replace function public.admin_resolve(rid bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  update reports set resolved = true where id = rid;
end $$;

create or replace function public.admin_ban(uid uuid, ban boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  if uid = auth.uid() then raise exception 'cannot_ban_self'; end if;
  perform set_config('jiskra.bypass', 'on', true);
  update profiles set banned = ban where id = uid;
  if ban then update reports set resolved = true where reported = uid; end if;
end $$;

create or replace function public.admin_users(q text default '')
returns table (id uuid, name text, age int, city text, photo_url text, verified boolean, banned boolean,
               plan text, reports int, last_active timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  return query select p.id, p.name, age_of(p.birthdate), p.city, p.photo_url, p.verified, p.banned,
    current_plan(p.id), (select count(*)::int from reports r where r.reported = p.id), p.last_active, p.created_at
    from profiles p
    where q = '' or p.name ilike '%' || q || '%' or p.city ilike '%' || q || '%'
    order by p.created_at desc limit 100;
end $$;

-- ---------- PUSH NOTIFIKACE ----------
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "own push select" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "own push insert" on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy "own push update" on public.push_subscriptions for update using (user_id = auth.uid());
create policy "own push delete" on public.push_subscriptions for delete using (user_id = auth.uid());

create extension if not exists pg_net;
create schema if not exists private;
create table if not exists private.settings (key text primary key, value text not null);
-- Do private.settings se jednou vloží: push_url, push_secret, vapid_public, vapid_private, vapid_subject
-- (hodnoty nejsou v GitHubu, nastavuje je správce)

create or replace function public.notify_push() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  url text := (select value from private.settings where key = 'push_url');
  secret text := (select value from private.settings where key = 'push_secret');
  rec uuid; sname text; payload jsonb;
begin
  if url is null or secret is null then return new; end if;
  if tg_table_name = 'messages' then
    select case when m.user_a = new.sender then m.user_b else m.user_a end into rec from matches m where m.id = new.match_id;
    select name into sname from profiles where id = new.sender;
    payload := jsonb_build_object('to', rec, 'title', sname,
      'body', case when new.kind = 'image' then '📷 Poslal(a) ti fotku' else left(new.body, 120) end,
      'url', './#/chat/' || new.match_id, 'tag', 'chat-' || new.match_id);
    perform net.http_post(url := url, body := payload,
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  elsif tg_table_name = 'matches' then
    perform net.http_post(url := url,
      body := jsonb_build_object('to', new.user_a, 'title', 'Máš novou shodu! 💜', 'body', 'Napiš první a prolom ledy.', 'url', './#/chat/' || new.id, 'tag', 'match'),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
    perform net.http_post(url := url,
      body := jsonb_build_object('to', new.user_b, 'title', 'Máš novou shodu! 💜', 'body', 'Napiš první a prolom ledy.', 'url', './#/chat/' || new.id, 'tag', 'match'),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  end if;
  return new;
exception when others then
  return new; -- notifikace nikdy nesmí zablokovat zprávu
end $$;

create trigger messages_push after insert on public.messages
  for each row execute function public.notify_push();
create trigger matches_push after insert on public.matches
  for each row execute function public.notify_push();

-- ---------- PRÁVA K FUNKCÍM ----------
revoke execute on function public.check_message(), public.notify_push() from public, anon, authenticated;
revoke execute on function public.discover(int), public.profile_card(uuid), public.likes_me_full(), public.my_matches2(),
  public.mark_read(uuid), public.react(bigint, text), public.admin_stats(), public.admin_pending(),
  public.admin_verify(uuid, boolean), public.admin_reports(), public.admin_resolve(bigint),
  public.admin_ban(uuid, boolean), public.admin_users(text), public.is_admin(uuid) from public, anon;
grant execute on function public.discover(int), public.profile_card(uuid), public.likes_me_full(), public.my_matches2(),
  public.mark_read(uuid), public.react(bigint, text), public.admin_stats(), public.admin_pending(),
  public.admin_verify(uuid, boolean), public.admin_reports(), public.admin_resolve(bigint),
  public.admin_ban(uuid, boolean), public.admin_users(text), public.is_admin(uuid) to authenticated;
