-- v13: identita, orientace, prostor Duha, videoprofil
-- (sloupce gender_identity, orientation, show_identity, space, video_url a úprava discover3 jsou už v databázi)
-- ZBÝVÁ SPUSTIT:
do $$ declare d text; n0 int; begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where proname='top_picks' limit 1;
  n0 := length(d);
  d := replace(d, 'and not blocked_between(me.id, p.id)', 'and not blocked_between(me.id, p.id) and coalesce(p.space, ''vse'') = coalesce(me.space, ''vse'')');
  if length(d) = n0 then raise exception 'nothing replaced'; end if;
  execute d;
end $$;
revoke execute on function public.discover from authenticated, anon, public;
revoke execute on function public.get_candidates from authenticated, anon, public;
drop function if exists public.souzneni_data(uuid);
create function public.souzneni_data(pid uuid)
returns table(relax text[], interest_love text[], ascendant text, gender_identity text, orientation text, video_url text)
language sql stable security definer set search_path = public as $$
  select p.relax, p.interest_love, p.ascendant,
         case when p.show_identity then p.gender_identity end, case when p.show_identity then p.orientation end, p.video_url
  from profiles p
  where p.id = pid and not p.banned and not blocked_between((select auth.uid()), pid)
$$;
revoke execute on function public.souzneni_data(uuid) from public, anon;
grant execute on function public.souzneni_data(uuid) to authenticated;
