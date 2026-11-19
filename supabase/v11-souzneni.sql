-- v11: Souznění (podrobné záliby s mírou, odpočinek, ascendent) + ochrana proti nahým fotkám
alter table public.profiles add column if not exists relax text[] not null default '{}';
alter table public.profiles add column if not exists interest_love text[] not null default '{}';
alter table public.profiles add column if not exists ascendant text;

-- víc zájmů (podrobný katalog)
do $$ declare d text; begin
  select pg_get_functiondef('public.check_adult'::regproc) into d;
  d := replace(d, 'coalesce(array_length(new.interests, 1), 0) > 10', 'coalesce(array_length(new.interests, 1), 0) > 20');
  d := replace(d, $q$  if coalesce(array_length(new.photos, 1), 0) > 6$q$, $q$  if coalesce(array_length(new.relax, 1), 0) > 4 or coalesce(array_length(new.interest_love, 1), 0) > 8 then raise exception 'too_many_interests'; end if;
  if coalesce(array_length(new.photos, 1), 0) > 6$q$);
  execute d;
end $$;

-- údaje pro výpočet souznění u cizího profilu (jen co je potřeba, respektuje blokace)
create or replace function public.souzneni_data(pid uuid)
returns table(relax text[], interest_love text[], ascendant text)
language sql stable security definer set search_path = public as $$
  select p.relax, p.interest_love, p.ascendant from profiles p
  where p.id = pid and not p.banned and not blocked_between((select auth.uid()), pid)
$$;
revoke execute on function public.souzneni_data(uuid) from public, anon;
grant execute on function public.souzneni_data(uuid) to authenticated;

-- Moderace fotek: nahota zjištěná v aplikaci → 1. pokus varování, 2. pokus trvalý zákaz
create table if not exists public.moderation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, score real, created_at timestamptz default now());
alter table public.moderation_events enable row level security;
create or replace function public.nsfw_strike(kind text, score real) returns text
language plpgsql security definer set search_path = public as $$
declare n int; me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not_authenticated'; end if;
  insert into moderation_events(user_id, kind, score) values (me, left(kind, 20), score);
  select count(*) into n from moderation_events where user_id = me and created_at > now() - interval '90 days';
  if n >= 2 then
    perform set_config('jiskra.bypass', 'on', true);
    update profiles set banned = true, paused = true where id = me;
    return 'banned';
  end if;
  return 'warned';
end $$;
revoke execute on function public.nsfw_strike(text, real) from public, anon;
grant execute on function public.nsfw_strike(text, real) to authenticated;

-- Jak to kdo myslí: víc možností
alter table public.profiles drop constraint if exists profiles_goal_check;
alter table public.profiles add constraint profiles_goal_check check (goal is null or goal in ('vztah','neco_volneho','nevim','pratelstvi','spolecnik'));
alter table public.profiles drop constraint if exists profiles_ascendant_check;
alter table public.profiles add constraint profiles_ascendant_check check (ascendant is null or ascendant in ('Beran','Býk','Blíženci','Rak','Lev','Panna','Váhy','Štír','Střelec','Kozoroh','Vodnář','Ryby'));

-- Znalostní báze AI asistenta podpory (učí se z odpovědí admina) – jen pro service_role
create table if not exists public.support_kb (
  id bigint generated always as identity primary key,
  q text not null, a text not null, emb real[], source text not null default 'learned',
  hits int not null default 0, created_at timestamptz default now());
alter table public.support_kb enable row level security;

-- Nahlášení chyby: jde rovnou e-mailem, v aplikaci se neukládá do chatu
create table if not exists public.bug_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null, created_at timestamptz default now());
alter table public.bug_reports enable row level security;
create or replace function public.report_bug(msg text) returns void
language plpgsql security definer set search_path to 'public', 'private' as $$
declare me uuid := (select auth.uid()); n int; sname text; semail text;
  rkey text := (select value from private.settings where key = 'resend_key');
  remail text := coalesce((select value from private.settings where key = 'support_email'), 'jiskra.podpora@gmail.com');
  code text;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  msg := left(trim(coalesce(msg, '')), 3000);
  if length(msg) < 3 then raise exception 'empty'; end if;
  select count(*) into n from bug_reports where user_id = me and created_at > now() - interval '1 day';
  if n >= 10 then raise exception 'too_many'; end if;
  insert into bug_reports(user_id, body) values (me, msg);
  select name into sname from profiles where id = me;
  select email into semail from auth.users where id = me;
  code := upper(left(me::text, 8));
  if rkey is not null then
    perform net.http_post(url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || rkey),
      body := jsonb_build_object('from', 'Plamínek <onboarding@resend.dev>', 'to', jsonb_build_array(remail),
        'subject', 'Plamínek – 🐞 nahlášená chyba #' || code,
        'text', 'Nahlášená chyba v Plamínku' || chr(10) ||
          to_char(now() at time zone 'Europe/Prague', 'DD. MM. YYYY HH24:MI') || ' · od: ' || coalesce(sname, 'uživatel') || ' (' || coalesce(semail, '') || ')' || chr(10) || chr(10) ||
          msg || chr(10) || chr(10) || 'Kód: #' || code || chr(10) ||
          'Odpovědět v aplikaci: https://plaminek.marasafi2504.workers.dev/#/admin/support/' || left(me::text, 8)));
  end if;
end $$;
revoke execute on function public.report_bug(text) from public, anon;
grant execute on function public.report_bug(text) to authenticated;
