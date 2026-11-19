-- v10: e-mail podpory s celým textem, kódem konverzace a přímým odkazem do administrace
create or replace function public.support_notify() returns trigger
language plpgsql security definer set search_path to 'public', 'private' as $function$
declare
  url text := (select value from private.settings where key = 'push_url');
  secret text := (select value from private.settings where key = 'push_secret');
  rkey text := (select value from private.settings where key = 'resend_key');
  remail text := coalesce((select value from private.settings where key = 'support_email'), 'jiskra.podpora@gmail.com');
  hdr jsonb; a uuid; sname text; code text := upper(left(new.user_id::text, 8));
  link text := 'https://plaminek.marasafi2504.workers.dev/#/admin/support/' || left(new.user_id::text, 8);
begin
  hdr := jsonb_build_object('Content-Type','application/json','x-push-secret', secret);
  if new.from_admin then
    if url is not null and secret is not null then
      perform net.http_post(url := url, headers := hdr, body := jsonb_build_object('to', new.user_id,
        'title', 'Podpora Plamínku odpověděla 💜', 'body', left(new.body, 120), 'url', './#/support', 'tag', 'support'));
    end if;
    return new;
  end if;
  select name into sname from profiles where id = new.user_id;
  if url is not null and secret is not null then
    for a in select id from profiles where is_admin loop
      perform net.http_post(url := url, headers := hdr, body := jsonb_build_object('to', a,
        'title', case when new.body like '🐞%' then '🐞 Chyba od: ' else 'Podpora: ' end || coalesce(sname, 'uživatel'), 'body', left(new.body, 120),
        'url', './#/admin/support/' || left(new.user_id::text, 8), 'tag', 'support-' || new.user_id));
    end loop;
  end if;
  if rkey is not null then
    perform net.http_post(url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || rkey),
      body := jsonb_build_object('from', 'Plamínek <onboarding@resend.dev>', 'to', jsonb_build_array(remail),
        'subject', (case when new.body like '🐞%' then 'Plamínek – 🐞 nahlášená chyba' else 'Plamínek – nová zpráva podpoře' end) || ' #' || code,
        'text', (case when new.body like '🐞%' then 'Nahlášená chyba v Plamínku' else 'Nová zpráva podpoře v Plamínku' end) || chr(10) ||
                to_char(now() at time zone 'Europe/Prague', 'DD. MM. YYYY HH24:MI') || ' · od: ' || coalesce(sname, 'uživatel') || chr(10) || chr(10) ||
                new.body || chr(10) || chr(10) || 'Kód: #' || code || chr(10) || 'Odpovědět v aplikaci: ' || link));
  end if;
  return new;
exception when others then return new;
end $function$;
