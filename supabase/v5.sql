-- =====================================================================
-- Jiskra v5 – Zprávy bez shody (žádosti o zprávu, jako na Badoo)
--   Odeslat: zdarma 1/den (Gold 3/den, Platinum 5/den), další za 100 coinů
--   Příjemce bez Gold vidí žádost rozmazaně; odemkne ji Gold nebo 150 coinů
--   Přijetí žádosti = shoda + zpráva se přesune do chatu
-- Spouštět přes SQL editor; skript nic nemaže.
-- =====================================================================

create table if not exists public.message_requests (
  id         uuid primary key default gen_random_uuid(),
  sender     uuid not null references public.profiles on delete cascade,
  recipient  uuid not null references public.profiles on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  status     text not null default 'pending' check (status in ('pending','accepted','declined')),
  revealed   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (sender, recipient),
  check (sender <> recipient)
);
create index if not exists mreq_recipient_idx on public.message_requests (recipient, status, created_at desc);
alter table public.message_requests enable row level security;
do $$ begin
  create policy "own sent requests" on public.message_requests for select using (sender = auth.uid());
exception when duplicate_object then null; end $$;

create or replace function public.coin_price(item text) returns int
language sql immutable as $$
  select case item when 'boost' then 500 when 'super' then 100 when 'reveal' then 150
                   when 'rewind' then 50 when 'message' then 100 end
$$;

-- lajk vložený spolu se žádostí se nepočítá do denního limitu lajků
create or replace function public.check_swipe_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p text := current_plan(new.swiper);
  n int;
begin
  if exists (select 1 from profiles where id = new.swiper and banned) then raise exception 'banned'; end if;
  if new.kind = 'like' and p is null and coalesce(current_setting('jiskra.req_like', true), '') <> 'on' then
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

create or replace function public.request_quota()
returns table (used int, allowed int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from message_requests where sender = auth.uid() and created_at > now() - interval '24 hours'),
         case current_plan(auth.uid()) when 'platinum' then 5 when 'gold' then 3 else 1 end
$$;

-- Odeslat žádost. Vrací 'sent', nebo 'matched' (když už tě ten člověk lajkl – rovnou vznikne shoda a zpráva jde do chatu)
create or replace function public.send_request(pid uuid, msg text, with_coins boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  q record; mid uuid; txt text := btrim(coalesce(msg, ''));
begin
  if me is null or pid = me then raise exception 'forbidden'; end if;
  if char_length(txt) < 1 or char_length(txt) > 500 then raise exception 'bad_message'; end if;
  if exists (select 1 from profiles where id = me and (banned or paused)) then raise exception 'forbidden'; end if;
  if not exists (select 1 from profiles where id = pid and not banned) then raise exception 'not_found'; end if;
  if blocked_between(me, pid) then raise exception 'blocked'; end if;
  if exists (select 1 from matches where user_a = least(me, pid) and user_b = greatest(me, pid)) then raise exception 'already_match'; end if;
  if exists (select 1 from message_requests where sender = me and recipient = pid) then raise exception 'already_sent'; end if;
  if exists (select 1 from message_requests where sender = pid and recipient = me and status = 'pending') then raise exception 'they_wrote_you'; end if;

  select * into q from request_quota();
  if q.used >= q.allowed then
    if not with_coins then raise exception 'request_limit'; end if;
    perform coins_add(me, -coin_price('message'), 'message');
  end if;

  -- žádost zároveň znamená lajk
  perform set_config('jiskra.req_like', 'on', true);
  insert into swipes (swiper, swipee, kind) values (me, pid, 'like')
    on conflict (swiper, swipee) do update set kind = case when swipes.kind = 'pass' then 'like' else swipes.kind end;
  perform set_config('jiskra.req_like', 'off', true);

  select id into mid from matches where user_a = least(me, pid) and user_b = greatest(me, pid);
  if mid is null and exists (select 1 from swipes where swiper = pid and swipee = me and kind in ('like','super')) then
    insert into matches (user_a, user_b) values (least(me, pid), greatest(me, pid)) on conflict do nothing returning id into mid;
    if mid is null then select id into mid from matches where user_a = least(me, pid) and user_b = greatest(me, pid); end if;
  end if;
  if mid is not null then
    insert into messages (match_id, sender, body) values (mid, me, txt);
    return 'matched';
  end if;

  insert into message_requests (sender, recipient, body) values (me, pid, txt);
  return 'sent';
end $$;

create or replace function public.requests_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from message_requests r join profiles p on p.id = r.sender
  where r.recipient = auth.uid() and r.status = 'pending' and not p.banned and not blocked_between(r.sender, auth.uid())
$$;

-- Schránka žádostí: bez Gold (a bez odemčení) přijdou jen rozmazané údaje
create or replace function public.requests_inbox()
returns table (id uuid, created_at timestamptz, visible boolean, sender uuid, name text, age int,
               photo_url text, verified boolean, body text, preview text)
language sql stable security definer set search_path = public as $$
  with g as (select coalesce(current_plan(auth.uid()), '') in ('gold','platinum') as gold)
  select r.id, r.created_at, (g.gold or r.revealed),
         case when g.gold or r.revealed then p.id end,
         case when g.gold or r.revealed then p.name end,
         case when g.gold or r.revealed then age_of(p.birthdate) end,
         case when g.gold or r.revealed then p.photo_url end,
         case when g.gold or r.revealed then p.verified end,
         case when g.gold or r.revealed then r.body end,
         case when g.gold or r.revealed then null else left(r.body, 3) || '…' end
  from message_requests r join profiles p on p.id = r.sender, g
  where r.recipient = auth.uid() and r.status = 'pending' and not p.banned and not blocked_between(r.sender, auth.uid())
  order by r.created_at desc limit 50
$$;

create or replace function public.reveal_request(rid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from message_requests where id = rid and recipient = auth.uid() and status = 'pending') then raise exception 'not_found'; end if;
  if coalesce(current_plan(auth.uid()), '') in ('gold','platinum') then return; end if;
  if (select revealed from message_requests where id = rid) then return; end if;
  perform coins_add(auth.uid(), -coin_price('reveal'), 'reveal_message');
  update message_requests set revealed = true where id = rid;
end $$;

-- Přijmout (vznikne shoda, zpráva se přesune do chatu) nebo odmítnout
create or replace function public.answer_request(rid uuid, accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare r record; mid uuid; me uuid := auth.uid();
begin
  select * into r from message_requests where id = rid and recipient = me and status = 'pending' for update;
  if r.id is null then raise exception 'not_found'; end if;
  if not accept then
    update message_requests set status = 'declined' where id = rid;
    insert into swipes (swiper, swipee, kind) values (me, r.sender, 'pass') on conflict do nothing;
    return null;
  end if;
  if not (r.revealed or coalesce(current_plan(me), '') in ('gold','platinum')) then raise exception 'premium_required'; end if;
  if blocked_between(me, r.sender) then raise exception 'blocked'; end if;
  perform set_config('jiskra.req_like', 'on', true);
  insert into swipes (swiper, swipee, kind) values (me, r.sender, 'like')
    on conflict (swiper, swipee) do update set kind = 'like';
  perform set_config('jiskra.req_like', 'off', true);
  insert into matches (user_a, user_b) values (least(me, r.sender), greatest(me, r.sender)) on conflict do nothing;
  select id into mid from matches where user_a = least(me, r.sender) and user_b = greatest(me, r.sender);
  insert into messages (match_id, sender, body) values (mid, r.sender, r.body);
  update message_requests set status = 'accepted' where id = rid;
  return mid;
end $$;

-- Push upozornění na novou žádost
create or replace function public.request_push() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  url text := (select value from private.settings where key = 'push_url');
  secret text := (select value from private.settings where key = 'push_secret');
begin
  if url is null or secret is null then return new; end if;
  if coalesce((select (notify->>'messages')::boolean from profiles where id = new.recipient), true) is false then return new; end if;
  perform net.http_post(url := url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret),
    body := jsonb_build_object('to', new.recipient, 'title', 'Někdo ti napsal 💌',
      'body', 'Máš novou zprávu od člověka, se kterým zatím nemáš shodu.', 'url', './#/chats', 'tag', 'request'));
  return new;
exception when others then return new;
end $$;
do $$ begin
  create trigger message_requests_push after insert on public.message_requests for each row execute function public.request_push();
exception when duplicate_object then null; end $$;

revoke execute on function public.request_push(), public.check_swipe_limits() from public, anon, authenticated;
