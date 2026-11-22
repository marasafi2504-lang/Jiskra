-- v12: Odstoupení od smlouvy online (§ 1830a OZ, zákon č. 159/2026 Sb., účinnost 1. 1. 2027)
create table if not exists public.withdrawals (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, detail text, name text, email text,
  created_at timestamptz not null default now());
alter table public.withdrawals enable row level security;
drop policy if exists withdrawals_own on public.withdrawals;
create policy withdrawals_own on public.withdrawals for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.withdraw_request(kind text, detail text, fullname text) returns jsonb
language plpgsql security definer set search_path to 'public', 'private' as $$
declare me uuid := (select auth.uid()); semail text; wid bigint; at timestamptz := now();
  rkey text := (select value from private.settings where key = 'resend_key');
  remail text := coalesce((select value from private.settings where key = 'support_email'), 'jiskra.podpora@gmail.com');
  what text; stamp text; n int;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if kind not in ('predplatne', 'coiny') then raise exception 'bad_kind'; end if;
  select count(*) into n from withdrawals where user_id = me and created_at > now() - interval '1 day';
  if n >= 5 then raise exception 'too_many'; end if;
  select email into semail from auth.users where id = me;
  what := case kind when 'predplatne' then 'předplatné Plamínek' else 'nákup Boost Coinů' end;
  fullname := left(trim(coalesce(fullname, '')), 80); detail := left(trim(coalesce(detail, '')), 500);
  insert into withdrawals(user_id, kind, detail, name, email) values (me, kind, detail, fullname, semail) returning id into wid;
  stamp := to_char(at at time zone 'Europe/Prague', 'DD. MM. YYYY v HH24:MI');
  -- potvrzení přijetí spotřebiteli (zůstává uložené v jeho chatu s podporou)
  insert into support_messages(user_id, from_admin, body) values (me, true,
    '✅ Potvrzujeme přijetí odstoupení od smlouvy č. ' || wid || chr(10) ||
    'Přijato: ' || stamp || chr(10) || 'Týká se: ' || what || coalesce(nullif(' – ' || detail, ' – '), '') || chr(10) ||
    'Jméno: ' || coalesce(nullif(fullname, ''), '—') || ' · E-mail: ' || coalesce(semail, '—') || chr(10) || chr(10) ||
    'Peníze vrátíme do 14 dnů stejným způsobem, jakým jsi platil(a). Pokud jsi placené funkce už využíval(a), vrátíme částku poníženou o poměrnou část za dobu do odstoupení. Předplatné v Google Play zároveň zruš, aby se znovu neobnovilo.');
  if rkey is not null then
    perform net.http_post(url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || rkey),
      body := jsonb_build_object('from', 'Plamínek <onboarding@resend.dev>', 'to', jsonb_build_array(remail),
        'subject', 'Plamínek – ODSTOUPENÍ OD SMLOUVY č. ' || wid || ' (vrátit peníze do 14 dnů)',
        'text', 'Uživatel odstoupil od smlouvy přes tlačítko v aplikaci.' || chr(10) || chr(10) ||
          'Číslo: ' || wid || chr(10) || 'Přijato: ' || stamp || chr(10) || 'Týká se: ' || what || chr(10) ||
          'Upřesnění: ' || coalesce(nullif(detail, ''), '—') || chr(10) || 'Jméno: ' || coalesce(nullif(fullname, ''), '—') || chr(10) ||
          'E-mail: ' || coalesce(semail, '—') || chr(10) || 'ID uživatele: ' || me || chr(10) || chr(10) ||
          'Do 14 dnů vrať peníze (Google Play Console → Objednávky → Vrátit peníze), u předplatného případně jen poměrnou část.' || chr(10) ||
          'Odpovědět v aplikaci: https://plaminek.marasafi2504.workers.dev/#/admin/support/' || left(me::text, 8)));
  end if;
  return jsonb_build_object('id', wid, 'at', at);
end $$;
revoke execute on function public.withdraw_request(text, text, text) from public, anon;
grant execute on function public.withdraw_request(text, text, text) to authenticated;
