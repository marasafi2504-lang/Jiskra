-- v7: zpřísnění práv k funkcím (podle Supabase Security Advisor)
-- Nepřihlášení (anon) nesmí volat žádnou SECURITY DEFINER funkci.
do $$ declare r record; begin
 for r in select p.oid::regprocedure sig, p.proname, pg_get_function_result(p.oid) res
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef and p.prokind='f' loop
   execute format('revoke execute on function %s from public, anon', r.sig);
   if r.res = 'trigger' or r.proname in ('discover','get_candidates','my_matches','my_matches2','profile_card','likes_me','rls_auto_enable','coins_add','credit_coins') then
     execute format('revoke execute on function %s from authenticated', r.sig);
   else
     execute format('grant execute on function %s to authenticated', r.sig);
   end if;
 end loop;
end $$;
alter function public.coin_price set search_path = public;

-- Výkon: auth.uid() v pravidlech se vyhodnotí jednou na dotaz, ne pro každý řádek
do $$ declare r record; q text; c text; s text; begin
 for r in select * from pg_policies where schemaname='public' and (coalesce(qual,'') ~ 'auth\.uid\(\)' or coalesce(with_check,'') ~ 'auth\.uid\(\)') loop
   q := case when r.qual is null then null when r.qual ~* 'select auth\.uid\(\)' then r.qual else replace(r.qual,'auth.uid()','(select auth.uid())') end;
   c := case when r.with_check is null then null when r.with_check ~* 'select auth\.uid\(\)' then r.with_check else replace(r.with_check,'auth.uid()','(select auth.uid())') end;
   s := format('alter policy %I on public.%I', r.policyname, r.tablename);
   if q is not null then s := s || format(' using (%s)', q); end if;
   if c is not null then s := s || format(' with check (%s)', c); end if;
   execute s;
 end loop;
end $$;
create index if not exists matches_user_b_idx on public.matches(user_b);
create index if not exists messages_sender_idx on public.messages(sender);
create index if not exists reports_reported_idx on public.reports(reported);
create index if not exists reports_reporter_idx on public.reports(reporter);
create index if not exists revealed_likes_liker_idx on public.revealed_likes(liker);
