-- Read-only: run manually after the new migration. No user values or secrets returned.
select 'HERE service gate' component, to_regprocedure('public.atlas_here_begin(uuid,uuid,uuid,text)') is not null ok
union all
select 'HERE gate denied to authenticated',not has_function_privilege('authenticated','public.atlas_here_begin(uuid,uuid,uuid,text)','execute')
union all
select 'HERE gate allowed to service role',has_function_privilege('service_role','public.atlas_here_begin(uuid,uuid,uuid,text)','execute')
union all
select 'HERE cache RLS',coalesce((select relrowsecurity from pg_class where oid=to_regclass('atlas_private.here_requests')),false)
union all
select 'cost validation triggers',(select count(*)=2 from pg_trigger where tgname in('atlas_experience_costs','atlas_trip_costs'));
