-- =====================================================================
-- Jiskra v3 – detaily profilu, filtry, boost, kdo mě viděl, top výběr,
-- blokování, pozastavení profilu, nastavení upozornění, hlasové zprávy a nálepky
-- (spouští se jednou, po schema.sql a v2.sql)
-- =====================================================================
begin;

alter table public.profiles
  add column if not exists height_cm int check (height_cm is null or height_cm between 120 and 230),
  add column if not exists education text check (education is null or education in ('zakladni','stredni','vysoka','student')),
  add column if not exists goal text check (goal is null or goal in ('vztah','neco_volneho','nevim','pratelstvi')),
  add column if not exists smoking text check (smoking is null or smoking in ('ne','obcas','ano')),
  add column if not exists drinking text check (drinking is null or drinking in ('ne','obcas','ano')),
  add column if not exists kids text check (kids is null or kids in ('nemam_chci','nemam_nechci','mam','nevim')),
  add column if not exists religion text check (religion is null or religion in ('zadne','krestanstvi','jine','nechci_rict')),
  add column if not exists paused boolean not null default false,
  add column if not exists notify jsonb not null default '{"matches":true,"messages":true,"likes":true}'::jsonb,
  add column if not exists filters jsonb not null default '{}'::jsonb,
  add column if not exists boost_until timestamptz;

-- Ochrana profilu (doplněno: boost_until smí měnit jen funkce use_boost)
create or replace function public.check_adult() returns trigger
language plpgsql set search_path = public as $$
declare
  bypass boolean := coalesce(current_setting('jiskra.bypass', true), '') = 'on';
begin
  if new.birthdate > (current_date - interval '18 years') then raise exception 'under_18'; end if;
  if coalesce(array_length(new.interests, 1), 0) > 10 then raise exception 'too_many_interests'; end if;
  if coalesce(array_length(new.photos, 1), 0) > 6 then raise exception 'too_many_photos'; end if;
  if jsonb_typeof(new.prompts) <> 'array' or jsonb_array_length(new.prompts) > 3 then raise exception 'too_many_prompts'; end if;
  if jsonb_typeof(new.notify) <> 'object' or jsonb_typeof(new.filters) <> 'object' then raise exception 'bad_settings'; end if;
  if new.lat is not null then new.lat := round(new.lat::numeric, 2)::double precision; end if;
  if new.lng is not null then new.lng := round(new.lng::numeric, 2)::double precision; end if;
  if coalesce(array_length(new.photos, 1), 0) > 0 then new.photo_url := new.photos[1]; end if;
  if not bypass and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.verified := false; new.is_admin := false; new.banned := false;
      new.verification_status := 'none'; new.boost_until := null;
    else
      new.id := old.id;
      new.verified := old.verified; new.is_admin := old.is_admin; new.banned := old.banned;
      new.boost_until := old.boost_until;
      if new.verification_status is distinct from old.verification_status
         and not (new.verification_status = 'pending' and old.verification_status in ('none','rejected')) then
        new.verification_status := old.verification_status;
      end if;
    end if;
  end if;
  return new;
end $$;

-- ---------- BLOKOVÁNÍ ----------
create table if not exists public.blocks (
  blocker    uuid not null references public.profiles on delete cascade,
  blocked    uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked);
alter table public.blocks enable row level security;
create policy "own blocks select" on public.blocks for select using (blocker = auth.uid());
create policy "own blocks insert" on public.blocks for insert with check (blocker = auth.uid());
create policy "own blocks delete" on public.blocks for delete using (blocker = auth.uid());

create or replace function public.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;

create or replace function public.my_blocks()
returns table (id uuid, name text, photo_url text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.photo_url, b.created_at from blocks b join profiles p on p.id = b.blocked
  where b.blocker = auth.uid() order by b.created_at desc
$$;

-- ---------- NÁVŠTĚVY PROFILU ----------
create table if not exists public.profile_views (
  viewer     uuid not null references public.profiles on delete cascade,
  viewed     uuid not null references public.profiles on delete cascade,
  day        date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (viewer, viewed, day)
);
create index if not exists views_viewed_idx on public.profile_views (viewed, created_at desc);
alter table public.profile_views enable row level security;

create or replace function public.record_view(pid uuid) returns void
language sql security definer set search_path = public as $$
  insert into profile_views (viewer, viewed)
  select auth.uid(), pid
  where auth.uid() is not null and pid <> auth.uid() and not blocked_between(auth.uid(), pid)
    and exists (select 1 from profiles where id = auth.uid() and not paused and not banned)
  on conflict do nothing
$$;

create or replace function public.viewers_count() returns int
language sql stable security definer set search_path = public as $$
  select count(distinct viewer)::int from profile_views v
  where v.viewed = auth.uid() and v.created_at > now() - interval '30 days' and not blocked_between(v.viewer, auth.uid())
$$;

create or replace function public.viewers()
returns table (id uuid, name text, age int, photo_url text, verified boolean, viewed_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(current_plan(auth.uid()), '') not in ('gold','platinum') then raise exception 'premium_required'; end if;
  return query
    select p.id, p.name, age_of(p.birthdate), p.photo_url, p.verified, max(v.created_at)
    from profile_views v join profiles p on p.id = v.viewer
    where v.viewed = auth.uid() and v.created_at > now() - interval '30 days'
      and not p.banned and not blocked_between(p.id, auth.uid())
    group by p.id, p.name, p.birthdate, p.photo_url, p.verified
    order by max(v.created_at) desc limit 100;
end $$;

-- ---------- BOOST ----------
create table if not exists public.boosts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  started_at timestamptz not null default now(),
  ends_at    timestamptz not null
);
create index if not exists boosts_user_idx on public.boosts (user_id, started_at desc);
alter table public.boosts enable row level security;
create policy "own boosts select" on public.boosts for select using (user_id = auth.uid());

-- Gold: 1 boost / 30 dní, Platinum: 3 / 30 dní (zdarma v předplatném)
create or replace function public.use_boost() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  p text := current_plan(auth.uid());
  used int; allowed int; ends timestamptz;
begin
  if (select boost_until from profiles where id = auth.uid()) > now() then raise exception 'boost_active'; end if;
  allowed := case p when 'platinum' then 3 when 'gold' then 1 else 0 end;
  select count(*) into used from boosts where user_id = auth.uid() and started_at > now() - interval '30 days';
  if used >= allowed then raise exception 'boost_unavailable'; end if;
  ends := now() + interval '30 minutes';
  insert into boosts (user_id, ends_at) values (auth.uid(), ends);
  perform set_config('jiskra.bypass', 'on', true);
  update profiles set boost_until = ends where id = auth.uid();
  return ends;
end $$;

create or replace function public.boost_status()
returns table (active_until timestamptz, used int, allowed int)
language sql stable security definer set search_path = public as $$
  select (select case when boost_until > now() then boost_until end from profiles where id = auth.uid()),
         (select count(*)::int from boosts where user_id = auth.uid() and started_at > now() - interval '30 days'),
         case current_plan(auth.uid()) when 'platinum' then 3 when 'gold' then 1 else 0 end
$$;

-- ---------- FILTRY ----------
create or replace function public.passes_filters(me public.profiles, p public.profiles) returns boolean
language plpgsql stable set search_path = public as $$
declare
  f jsonb := coalesce(me.filters, '{}'::jsonb);
begin
  -- pokročilé filtry platí jen s předplatným
  if current_plan(me.id) is null then return true; end if;
  if (f->>'verified_only')::boolean is true and not p.verified then return false; end if;
  if f ? 'min_height' and p.height_cm is not null and p.height_cm < (f->>'min_height')::int then return false; end if;
  if f ? 'max_height' and p.height_cm is not null and p.height_cm > (f->>'max_height')::int then return false; end if;
  if jsonb_typeof(f->'goals') = 'array' and jsonb_array_length(f->'goals') > 0
     and (p.goal is null or not (f->'goals') ? p.goal) then return false; end if;
  if jsonb_typeof(f->'smoking') = 'array' and jsonb_array_length(f->'smoking') > 0
     and (p.smoking is null or not (f->'smoking') ? p.smoking) then return false; end if;
  if jsonb_typeof(f->'kids') = 'array' and jsonb_array_length(f->'kids') > 0
     and (p.kids is null or not (f->'kids') ? p.kids) then return false; end if;
  if jsonb_typeof(f->'religion') = 'array' and jsonb_array_length(f->'religion') > 0
     and (p.religion is null or not (f->'religion') ? p.religion) then return false; end if;
  return true;
end $$;

-- ---------- OBJEVOVÁNÍ v3 ----------
create or replace function public.discover3(lim int default 20)
returns table (id uuid, name text, age int, bio text, city text, job text, interests text[],
               photos text[], prompts jsonb, personality text, zodiac text, mode text,
               verified boolean, distance_km int, compat int, active_recently boolean,
               super_liked_me boolean, height_cm int, education text, goal text, smoking text,
               drinking text, kids text, religion text, boosted boolean)
language sql stable security definer set search_path = public as $$
  with me as (select * from profiles where id = auth.uid() and not banned)
  select p.id, p.name, age_of(p.birthdate), p.bio, p.city, p.job, p.interests,
         case when coalesce(array_length(p.photos,1),0) > 0 then p.photos
              when p.photo_url is not null then array[p.photo_url] else '{}'::text[] end,
         p.prompts, p.personality, zodiac_of(p.birthdate), p.mode, p.verified,
         dist_km(me.lat, me.lng, p.lat, p.lng), compat(me.personality, p.personality),
         p.last_active > now() - interval '1 day',
         exists (select 1 from swipes s where s.swiper = p.id and s.swipee = me.id and s.kind = 'super'),
         p.height_cm, p.education, p.goal, p.smoking, p.drinking, p.kids, p.religion,
         coalesce(p.boost_until > now(), false)
  from profiles p, me
  where p.id <> me.id and not p.banned and not p.paused
    and not exists (select 1 from swipes s where s.swiper = me.id and s.swipee = p.id)
    and not blocked_between(me.id, p.id)
    and modes_fit(me.mode, me.gender, me.looking_for, p.mode, p.gender, p.looking_for)
    and age_of(p.birthdate) between me.min_age and me.max_age
    and age_of(me.birthdate) between p.min_age and p.max_age
    and (dist_km(me.lat, me.lng, p.lat, p.lng) is null
         or dist_km(me.lat, me.lng, p.lat, p.lng) <= least(me.max_distance_km, p.max_distance_km))
    and passes_filters(me.*::profiles, p.*::profiles)
  order by
    (exists (select 1 from swipes s where s.swiper = p.id and s.swipee = me.id)
       and current_plan(p.id) = 'platinum') desc,
    coalesce(p.boost_until > now(), false) desc,
    (p.photo_url is not null) desc,
    (p.last_active > now() - interval '3 days') desc,
    coalesce(dist_km(me.lat, me.lng, p.lat, p.lng), 500) / 25,
    random()
  limit least(lim, 50)
$$;

create or replace function public.profile_card3(pid uuid)
returns table (id uuid, name text, age int, bio text, city text, job text, interests text[],
               photos text[], prompts jsonb, personality text, zodiac text, mode text,
               verified boolean, distance_km int, compat int, active_recently boolean,
               super_liked_me boolean, height_cm int, education text, goal text, smoking text,
               drinking text, kids text, religion text, boosted boolean)
language sql stable security definer set search_path = public as $$
  with me as (select * from profiles where id = auth.uid())
  select p.id, p.name, age_of(p.birthdate), p.bio, p.city, p.job, p.interests,
         case when coalesce(array_length(p.photos,1),0) > 0 then p.photos
              when p.photo_url is not null then array[p.photo_url] else '{}'::text[] end,
         p.prompts, p.personality, zodiac_of(p.birthdate), p.mode, p.verified,
         dist_km(me.lat, me.lng, p.lat, p.lng), compat(me.personality, p.personality),
         p.last_active > now() - interval '1 day',
         exists (select 1 from swipes s where s.swiper = p.id and s.swipee = me.id and s.kind = 'super'),
         p.height_cm, p.education, p.goal, p.smoking, p.drinking, p.kids, p.religion,
         coalesce(p.boost_until > now(), false)
  from profiles p, me
  where p.id = pid and not p.banned and not blocked_between(me.id, p.id)
    and (exists (select 1 from matches m where m.user_a = least(me.id,p.id) and m.user_b = greatest(me.id,p.id))
         or exists (select 1 from swipes s where s.swiper = p.id and s.swipee = me.id)
         or exists (select 1 from profile_views v where v.viewer = p.id and v.viewed = me.id)
         or modes_fit(me.mode, me.gender, me.looking_for, p.mode, p.gender, p.looking_for))
$$;

-- Top výběr dne: nejlepší shody podle osobnosti a zájmů (Gold vidí 10, ostatní 3)
create or replace function public.top_picks()
returns table (id uuid, name text, age int, photos text[], verified boolean, distance_km int,
               compat int, shared int, total int)
language sql stable security definer set search_path = public as $$
  with me as (select * from profiles where id = auth.uid() and not banned),
  cand as (
    select p.*, me.lat as mlat, me.lng as mlng, me.personality as mpers,
      (select count(*) from unnest(p.interests) i where i = any(me.interests))::int as sh
    from profiles p, me
    where p.id <> me.id and not p.banned and not p.paused
      and not exists (select 1 from swipes s where s.swiper = me.id and s.swipee = p.id)
      and not blocked_between(me.id, p.id)
      and modes_fit(me.mode, me.gender, me.looking_for, p.mode, p.gender, p.looking_for)
      and age_of(p.birthdate) between me.min_age and me.max_age
      and age_of(me.birthdate) between p.min_age and p.max_age
      and p.photo_url is not null
  ),
  ranked as (
    select c.*, coalesce(compat(c.mpers, c.personality), 60) + c.sh * 6 + case when c.verified then 8 else 0 end
             - least(coalesce(dist_km(c.mlat, c.mlng, c.lat, c.lng), 50), 200) / 10 as score
    from cand c order by score desc, md5(c.id::text || current_date::text) limit 10
  )
  select r.id, r.name, age_of(r.birthdate),
         case when coalesce(array_length(r.photos,1),0) > 0 then r.photos else array[r.photo_url] end,
         r.verified, dist_km(r.mlat, r.mlng, r.lat, r.lng), compat(r.mpers, r.personality), r.sh,
         (select count(*)::int from ranked)
  from ranked r
  limit case when coalesce(current_plan(auth.uid()), '') in ('gold','platinum') then 10 else 3 end
$$;

-- Shody v3 (bez blokovaných)
create or replace function public.my_matches3()
returns table (match_id uuid, other_id uuid, name text, age int, photo_url text, verified boolean,
               active_recently boolean, last_body text, last_kind text, last_at timestamptz,
               last_from_me boolean, unread int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, p.id, p.name, age_of(p.birthdate), p.photo_url, p.verified,
         p.last_active > now() - interval '1 day',
         lm.body, coalesce(lm.media_type, lm.kind), lm.created_at, lm.sender = auth.uid(),
         (select count(*)::int from messages x where x.match_id = m.id and x.sender <> auth.uid() and x.read_at is null),
         m.created_at
  from matches m
  join profiles p on p.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
  left join lateral (
    select body, kind, media_type, created_at, sender from messages where match_id = m.id
    order by created_at desc limit 1
  ) lm on true
  where auth.uid() in (m.user_a, m.user_b) and not p.banned and not blocked_between(auth.uid(), p.id)
  order by coalesce(lm.created_at, m.created_at) desc
$$;

-- Lajky bez blokovaných
create or replace function public.likes_me_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from swipes s
  where s.swipee = auth.uid() and s.kind in ('like','super') and not blocked_between(s.swiper, auth.uid())
    and not exists (select 1 from swipes x where x.swiper = auth.uid() and x.swipee = s.swiper)
$$;

create or replace function public.likes_me_full()
returns table (id uuid, name text, age int, photos text[], verified boolean, distance_km int,
               compat int, super_liked_me boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(current_plan(auth.uid()), '') not in ('gold','platinum') then raise exception 'premium_required'; end if;
  return query
    select p.id, p.name, age_of(p.birthdate),
           case when coalesce(array_length(p.photos,1),0) > 0 then p.photos
                when p.photo_url is not null then array[p.photo_url] else '{}'::text[] end,
           p.verified, dist_km(me.lat, me.lng, p.lat, p.lng), compat(me.personality, p.personality),
           s.kind = 'super'
    from swipes s join profiles p on p.id = s.swiper join profiles me on me.id = auth.uid()
    where s.swipee = auth.uid() and s.kind in ('like','super') and not p.banned
      and not blocked_between(p.id, auth.uid())
      and not exists (select 1 from swipes x where x.swiper = auth.uid() and x.swipee = s.swiper)
    order by s.created_at desc;
end $$;

-- ---------- CHAT: hlasové zprávy a nálepky ----------
-- hlas a nálepky se ukládají jako kind='image' + media_type (bez změny původního omezení)
alter table public.messages add column if not exists media_type text
  check (media_type is null or media_type in ('photo','audio','sticker'));

create or replace function public.check_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare other uuid;
begin
  if exists (select 1 from profiles where id = new.sender and banned) then raise exception 'banned'; end if;
  select case when m.user_a = new.sender then m.user_b else m.user_a end into other from matches m where m.id = new.match_id;
  if other is not null and blocked_between(new.sender, other) then raise exception 'blocked'; end if;
  new.created_at := now(); new.read_at := null; new.reaction := null;
  if new.kind = 'image' and new.media_type = 'sticker' then
    if new.image_url is null or new.image_url !~ '^https://fonts\.gstatic\.com/s/e/notoemoji/latest/[0-9a-f_]+/512\.(webp|gif)$' then
      raise exception 'bad_sticker';
    end if;
  elsif new.kind = 'image' and (new.image_url is null
     or new.image_url not like ('%/storage/v1/object/public/photos/' || new.sender::text || '/%')) then
    raise exception 'bad_media';
  end if;
  if new.kind = 'text' then new.image_url := null; new.media_type := null; end if;
  return new;
end $$;

-- ---------- UPOZORNĚNÍ podle nastavení ----------
create or replace function public.notify_push() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  url text := (select value from private.settings where key = 'push_url');
  secret text := (select value from private.settings where key = 'push_secret');
  rec uuid; sname text; payload jsonb; hdr jsonb;
begin
  if url is null or secret is null then return new; end if;
  hdr := jsonb_build_object('Content-Type','application/json','x-push-secret', secret);
  if tg_table_name = 'messages' then
    select case when m.user_a = new.sender then m.user_b else m.user_a end into rec from matches m where m.id = new.match_id;
    if coalesce((select (notify->>'messages')::boolean from profiles where id = rec), true) is false then return new; end if;
    select name into sname from profiles where id = new.sender;
    payload := jsonb_build_object('to', rec, 'title', sname,
      'body', case when new.kind = 'text' then left(new.body, 120)
                   when new.media_type = 'audio' then '🎤 Hlasová zpráva'
                   when new.media_type = 'sticker' then '✨ Nálepka' else '📷 Poslal(a) ti fotku' end,
      'url', './#/chat/' || new.match_id, 'tag', 'chat-' || new.match_id);
    perform net.http_post(url := url, body := payload, headers := hdr);
  elsif tg_table_name = 'matches' then
    if coalesce((select (notify->>'matches')::boolean from profiles where id = new.user_a), true) then
      perform net.http_post(url := url, headers := hdr,
        body := jsonb_build_object('to', new.user_a, 'title', 'Máš novou shodu! 💜', 'body', 'Napiš první a prolom ledy.', 'url', './#/chat/' || new.id, 'tag', 'match'));
    end if;
    if coalesce((select (notify->>'matches')::boolean from profiles where id = new.user_b), true) then
      perform net.http_post(url := url, headers := hdr,
        body := jsonb_build_object('to', new.user_b, 'title', 'Máš novou shodu! 💜', 'body', 'Napiš první a prolom ledy.', 'url', './#/chat/' || new.id, 'tag', 'match'));
    end if;
  elsif tg_table_name = 'swipes' then
    if new.kind = 'super' and coalesce((select (notify->>'likes')::boolean from profiles where id = new.swipee), true) then
      perform net.http_post(url := url, headers := hdr,
        body := jsonb_build_object('to', new.swipee, 'title', 'Někdo ti dal Super Like ⭐', 'body', 'Podívej se v Objevuj, kdo to je.', 'url', './#/discover', 'tag', 'super'));
    end if;
  end if;
  return new;
exception when others then
  return new;
end $$;

create trigger swipes_push after insert on public.swipes for each row execute function public.notify_push();

-- ---------- PRÁVA ----------
revoke execute on function public.notify_push(), public.check_message(), public.check_adult() from public, anon, authenticated;
revoke execute on function public.passes_filters(public.profiles, public.profiles), public.blocked_between(uuid, uuid),
  public.my_blocks(), public.record_view(uuid), public.viewers_count(), public.viewers(), public.use_boost(),
  public.boost_status(), public.discover3(int), public.profile_card3(uuid), public.top_picks(), public.my_matches3()
  from public, anon;
grant execute on function public.my_blocks(), public.record_view(uuid), public.viewers_count(), public.viewers(),
  public.use_boost(), public.boost_status(), public.discover3(int), public.profile_card3(uuid), public.top_picks(),
  public.my_matches3(), public.blocked_between(uuid, uuid), public.passes_filters(public.profiles, public.profiles)
  to authenticated;

commit;
