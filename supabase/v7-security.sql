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
