-- v8: Chytré řazení v Objevuj (skóre místo pevného pořadí)
create or replace function public.discover3(lim integer default 20)
returns table(id uuid, name text, age integer, bio text, city text, job text, interests text[], photos text[], prompts jsonb, personality text, zodiac text, mode text, verified boolean, distance_km integer, compat integer, active_recently boolean, super_liked_me boolean, height_cm integer, education text, goal text, smoking text, drinking text, kids text, religion text, boosted boolean)
language sql stable security definer set search_path to 'public'
as $$
  with me as (select * from profiles where id = (select auth.uid()) and not banned),
  cand as (
    select p.*, me.id as me_id,
           dist_km(me.lat, me.lng, p.lat, p.lng) as d,
           compat(me.personality, p.personality) as c,
           exists (select 1 from swipes s where s.swiper = p.id and s.swipee = me.id and s.kind <> 'pass') as liked_me,
           exists (select 1 from swipes s where s.swiper = p.id and s.swipee = me.id and s.kind = 'super') as supered_me,
           coalesce(cardinality(array(select unnest(coalesce(p.interests,'{}')) intersect select unnest(coalesce(me.interests,'{}')))), 0) as shared,
           (p.goal is not null and p.goal = me.goal) as same_goal,
           (select count(*) from swipes s where s.swipee = p.id and s.kind <> 'pass' and s.created_at > now() - interval '1 day') as likes_today
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
  ),
  scored as (
    select cand.*,
      ( case when liked_me and current_plan(cand.id) = 'platinum' then 60 else 0 end   -- Platinum priorita
      + case when coalesce(boost_until > now(), false) then 35 else 0 end               -- aktivní Boost
      + case when supered_me then 25 when liked_me then 18 else 0 end                   -- šance na shodu
      + coalesce(c, 50) * 0.20                                                          -- povahová shoda
      + least(shared, 5) * 4                                                            -- společné zájmy
      + case when same_goal then 10 else 0 end                                          -- stejný cíl
      + case when verified then 8 else 0 end                                            -- ověřený profil
      + case when coalesce(cardinality(photos),0) >= 3 then 6
             when photo_url is null and coalesce(cardinality(photos),0) = 0 then -30 else 0 end
      + case when last_active > now() - interval '1 day' then 15
             when last_active > now() - interval '3 days' then 8
             when last_active < now() - interval '14 days' then -15 else 0 end         -- aktivita
      + case when created_at > now() - interval '3 days' then 10 else 0 end            -- noví lidé
      - least(coalesce(d, 30), 100) * 0.3                                               -- vzdálenost
      - least(likes_today, 20) * 0.8                                                    -- férovost (nejen ti nejpopulárnější)
      + random() * 12                                                                   -- pestrost
      ) as score
    from cand
  )
  select s.id, s.name, age_of(s.birthdate), s.bio, s.city, s.job, s.interests,
         case when coalesce(array_length(s.photos,1),0) > 0 then s.photos
              when s.photo_url is not null then array[s.photo_url] else '{}'::text[] end,
         s.prompts, s.personality, zodiac_of(s.birthdate), s.mode, s.verified,
         s.d, s.c, s.last_active > now() - interval '1 day', s.supered_me,
         s.height_cm, s.education, s.goal, s.smoking, s.drinking, s.kids, s.religion,
         coalesce(s.boost_until > now(), false)
  from scored s
  order by s.score desc
  limit least(lim, 50)
$$;
revoke execute on function public.discover3(integer) from public, anon;
grant execute on function public.discover3(integer) to authenticated;
