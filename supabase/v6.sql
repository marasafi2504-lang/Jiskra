-- =====================================================================
-- Jiskra v6 – Chat s podporou
--   Uživatel píše podpoře přímo v aplikaci (připnuté nahoře ve Zprávách).
--   Správce odpovídá v Administraci → Podpora. Správci přijde push notifikace
--   a (pokud je v private.settings klíč 'resend_key') i e-mail.
-- Spouštět přes SQL editor; skript nic nemaže.
-- =====================================================================

create table if not exists public.support_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  from_admin boolean not null default false,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists support_user_idx on public.support_messages (user_id, created_at);
alter table public.support_messages enable row level security;
do $$ begin
  create policy "own support select" on public.support_messages for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.support_messages;
exception when duplicate_object then null; end $$;

-- uživatel → podpora
create or replace function public.support_send(msg text) returns bigint
language plpgsql security definer set search_path = public as $$
declare txt text := btrim(coalesce(msg, '')); nid bigint;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then raise exception 'forbidden'; end if;
  if char_length(txt) < 1 or char_length(txt) > 2000 then raise exception 'bad_message'; end if;
  if (select count(*) from support_messages where user_id = auth.uid() and not from_admin and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too_many';
  end if;
  insert into support_messages (user_id, body) values (auth.uid(), txt) returning id into nid;
  return nid;
end $$;

create or replace function public.support_unread() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from support_messages where user_id = auth.uid() and from_admin and read_at is null
$$;

create or replace function public.support_mark_read() returns void
language sql security definer set search_path = public as $$
  update support_messages set read_at = now() where user_id = auth.uid() and from_admin and read_at is null
$$;

-- správce
create or replace function public.admin_support_threads()
returns table (user_id uuid, name text, photo_url text, email text, last_body text, last_at timestamptz, last_from_admin boolean, unread int)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  return query
    select p.id, p.name, p.photo_url, u.email::text, l.body, l.created_at, l.from_admin,
           (select count(*)::int from support_messages x where x.user_id = p.id and not x.from_admin and x.read_at is null)
    from (select distinct s.user_id from support_messages s) t
    join profiles p on p.id = t.user_id
    left join auth.users u on u.id = p.id
    join lateral (select s2.body, s2.created_at, s2.from_admin from support_messages s2 where s2.user_id = t.user_id order by s2.created_at desc limit 1) l on true
    order by l.created_at desc limit 200;
end $$;

create or replace function public.admin_support_thread(uid uuid)
returns table (id bigint, from_admin boolean, body text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  update support_messages s set read_at = now() where s.user_id = uid and not s.from_admin and s.read_at is null;
  return query select s.id, s.from_admin, s.body, s.created_at from support_messages s where s.user_id = uid order by s.created_at;
end $$;

create or replace function public.admin_support_reply(uid uuid, msg text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  if char_length(btrim(coalesce(msg, ''))) < 1 then raise exception 'bad_message'; end if;
  insert into support_messages (user_id, from_admin, body) values (uid, true, left(btrim(msg), 2000));
end $$;

create or replace function public.admin_support_unread() returns int
language sql stable security definer set search_path = public as $$
  select case when is_admin(auth.uid())
    then (select count(*)::int from support_messages where not from_admin and read_at is null) else 0 end
$$;

-- upozornění: odpověď → push uživateli; nová zpráva → push správcům + e-mail
create or replace function public.support_notify() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  url text := (select value from private.settings where key = 'push_url');
  secret text := (select value from private.settings where key = 'push_secret');
  rkey text := (select value from private.settings where key = 'resend_key');
  remail text := coalesce((select value from private.settings where key = 'support_email'), 'jiskra.podpora@gmail.com');
  hdr jsonb; a uuid; sname text;
begin
  hdr := jsonb_build_object('Content-Type','application/json','x-push-secret', secret);
  if new.from_admin then
    if url is not null and secret is not null then
      perform net.http_post(url := url, headers := hdr, body := jsonb_build_object('to', new.user_id,
        'title', 'Podpora Jiskry odpověděla 💜', 'body', left(new.body, 120), 'url', './#/support', 'tag', 'support'));
    end if;
    return new;
  end if;
  select name into sname from profiles where id = new.user_id;
  if url is not null and secret is not null then
    for a in select id from profiles where is_admin loop
      perform net.http_post(url := url, headers := hdr, body := jsonb_build_object('to', a,
        'title', 'Podpora: ' || coalesce(sname, 'uživatel'), 'body', left(new.body, 120),
        'url', './#/admin/support', 'tag', 'support-' || new.user_id));
    end loop;
  end if;
  -- E-mail přes Resend: kvůli GDPR bez jména, e-mailu i obsahu zprávy – jen upozornění
  if rkey is not null then
    perform net.http_post(url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || rkey),
      body := jsonb_build_object('from', 'Jiskra <onboarding@resend.dev>', 'to', jsonb_build_array(remail),
        'subject', 'Jiskra – nová zpráva podpoře',
        'text', 'V aplikaci Jiskra čeká nová zpráva podpoře.' || chr(10) || chr(10) ||
                'Přečteš si ji a odpovíš v aplikaci: Profil → Administrace → Podpora.'));
  end if;
  return new;
exception when others then return new;
end $$;
do $$ begin
  create trigger support_messages_notify after insert on public.support_messages for each row execute function public.support_notify();
exception when duplicate_object then null; end $$;
revoke execute on function public.support_notify() from public, anon, authenticated;
