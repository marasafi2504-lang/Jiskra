-- v9: Kontakty (Instagram, Facebook, telefon, e-mail, odkazy) ve zprávách jen s předplatným.
-- Instagram si může každý dát do profilu; vidí ho uživatelé s předplatným.
create or replace function public.has_contact(t text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    lower(t) ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'                                   -- e-mail
    or lower(t) ~ '(https?://|www\.)'                                                    -- odkaz
    or lower(t) ~ '[a-z0-9-]+\.(com|cz|sk|net|org|me|io|gg|ly|link|app|eu)(\M|/)'       -- doména
    or lower(t) ~ '\m(insta|instagram|instáč|instac|instáčo|ig|fb|facebook|messenger|snap|snapchat|whatsapp|whatsup|wapp|telegram|tiktok|signal|viber|discord|onlyfans)\M'
    or lower(t) ~ '(^|\s)@[a-z0-9._]{3,}'                                                -- @přezdívka
    or regexp_replace(t, '[\s.\-()/]', '', 'g') ~ '\+?\d{9,}'                            -- telefon
  , false)
$$;

create or replace function public.block_contacts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.body is null or not has_contact(new.body) then return new; end if;
  if current_plan(new.sender) is not null or coalesce((select is_admin from profiles where id = new.sender), false) then
    return new;
  end if;
  raise exception 'contact_blocked' using errcode = 'P0001';
end $$;
revoke execute on function public.block_contacts() from public, anon, authenticated;

drop trigger if exists messages_block_contacts on public.messages;
create trigger messages_block_contacts before insert or update of body on public.messages
  for each row execute function public.block_contacts();
drop trigger if exists requests_block_contacts on public.message_requests;
create trigger requests_block_contacts before insert or update of body on public.message_requests
  for each row execute function public.block_contacts();

alter table public.profiles add column if not exists instagram text
  check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$');

-- Instagram jiného uživatele: jen pro předplatitele (nebo vlastní profil)
create or replace function public.profile_instagram(pid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when pid = (select auth.uid()) then p.instagram
    when blocked_between((select auth.uid()), pid) then null
    when current_plan((select auth.uid())) is not null then p.instagram
    else case when p.instagram is not null then '🔒' end
  end
  from profiles p where p.id = pid and not p.banned
$$;
revoke execute on function public.profile_instagram(uuid) from public, anon;
grant execute on function public.profile_instagram(uuid) to authenticated;

-- v9b: kontakty ve zprávách jen s předplatným A po aspoň 10 zprávách (obě strany psaly);
-- v žádostech o zprávu nikdy. Instagram do profilu jen s předplatným, vidět jen předplatitelům.
create or replace function public.block_contacts() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; senders int;
begin
  if new.body is null or not has_contact(new.body) then return new; end if;
  if coalesce((select is_admin from profiles where id = new.sender), false) then return new; end if;
  if TG_TABLE_NAME = 'message_requests' then raise exception 'contact_too_early' using errcode = 'P0001'; end if;
  if current_plan(new.sender) is null then raise exception 'contact_needs_plan' using errcode = 'P0001'; end if;
  select count(*), count(distinct sender) into n, senders from messages where match_id = new.match_id and coalesce(kind,'text') <> 'system';
  if n < 10 or senders < 2 then raise exception 'contact_too_early:%', greatest(10 - n, 1) using errcode = 'P0001'; end if;
  return new;
end $$;
create or replace function public.instagram_needs_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.instagram is not null and new.instagram is distinct from old.instagram
     and current_plan(new.id) is null and not coalesce(new.is_admin, false) then
    raise exception 'instagram_needs_plan' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists profiles_instagram_plan on public.profiles;
create trigger profiles_instagram_plan before update of instagram on public.profiles
  for each row execute function public.instagram_needs_plan();
create or replace function public.profile_instagram(pid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when pid = (select auth.uid()) then p.instagram
    when p.instagram is null or current_plan(pid) is null then null
    when blocked_between((select auth.uid()), pid) then null
    when current_plan((select auth.uid())) is not null then p.instagram
    else '🔒'
  end
  from profiles p where p.id = pid and not p.banned
$$;

-- v9c: s předplatným kontakty hned, bez předplatného po 10 zprávách (oba psali)
create or replace function public.block_contacts() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; senders int;
begin
  if new.body is null or not has_contact(new.body) then return new; end if;
  if coalesce((select is_admin from profiles where id = new.sender), false) then return new; end if;
  if TG_TABLE_NAME = 'message_requests' then raise exception 'contact_too_early' using errcode = 'P0001'; end if;
  if current_plan(new.sender) is not null then return new; end if;
  select count(*), count(distinct sender) into n, senders from messages where match_id = new.match_id and coalesce(kind,'text') <> 'system';
  if n < 10 or senders < 2 then raise exception 'contact_too_early:%', greatest(10 - n, 1) using errcode = 'P0001'; end if;
  return new;
end $$;
