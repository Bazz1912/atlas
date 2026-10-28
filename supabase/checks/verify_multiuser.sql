-- Facoltativo: eseguire nel SQL Editor DOPO 202610260001_multiuser.sql.
-- SOLO LETTURA. Non mostra dati degli utenti, credenziali o chiavi.
-- Ogni riga dovrebbe avere ok=true. Non sostituisce i test con JWT/account reali.
with expected(schema_name,table_name) as (values
 ('public','atlas_profiles'),('public','atlas_maps'),('public','atlas_map_members'),
 ('public','atlas_connection_requests'),('public','atlas_connections'),
 ('public','atlas_categories'),('public','atlas_experiences'),('public','atlas_visits'),
 ('public','atlas_reviews'),('public','atlas_trips'),('public','atlas_imports'),
 ('atlas_private','rate_limits')
)
select 'table_rls' as kind,e.schema_name||'.'||e.table_name as component,
 coalesce(c.relrowsecurity,false) as ok
from expected e left join pg_namespace n on n.nspname=e.schema_name
left join pg_class c on c.relnamespace=n.oid and c.relname=e.table_name and c.relkind='r'
union all
select 'table_no_anon',e.schema_name||'.'||e.table_name,
 case when c.oid is null then false else not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') end
from expected e left join pg_namespace n on n.nspname=e.schema_name
left join pg_class c on c.relnamespace=n.oid and c.relname=e.table_name and c.relkind='r'
order by kind,component;

with expected(signature) as (values
 ('public.atlas_search_users(text)'),('public.atlas_send_request(uuid)'),
 ('public.atlas_respond_request(uuid,text)'),('public.atlas_manage_map(uuid,text,boolean)'),
 ('public.atlas_save_review(uuid,uuid,jsonb)'),('public.atlas_save_experience(uuid,jsonb,jsonb)'),
 ('public.atlas_save_trip(uuid,jsonb)'),('public.atlas_remove_category(uuid,text,text)'),
 ('public.atlas_import_legacy(uuid,text,jsonb)')
)
select 'rpc_permissions' as kind,signature as component,
 case when to_regprocedure(signature) is null then false else
 has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE')
 and not has_function_privilege('anon',to_regprocedure(signature),'EXECUTE') end as ok
from expected order by signature;

with expected(schema_name,table_name,trigger_name) as (values
 ('auth','users','atlas_signup'),('public','atlas_profiles','atlas_profile_identity'),
 ('public','atlas_experiences','atlas_experiences_identity'),
 ('public','atlas_categories','atlas_categories_identity'),('public','atlas_visits','atlas_visits_identity'),
 ('public','atlas_reviews','atlas_reviews_identity'),('public','atlas_trips','atlas_trips_identity'),
 ('public','atlas_experiences','atlas_experience_payload'),('public','atlas_trips','atlas_trip_payload'),
 ('public','atlas_reviews','atlas_review_author')
)
select 'trigger' as kind,trigger_name as component,exists(
 select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname=e.schema_name and c.relname=e.table_name and t.tgname=e.trigger_name and t.tgenabled in ('O','A')
) as ok from expected e order by trigger_name;

with expected(child,parent) as (values
 ('atlas_profiles','auth.users'),('atlas_maps','auth.users'),('atlas_map_members','public.atlas_maps'),
 ('atlas_map_members','auth.users'),('atlas_experiences','public.atlas_maps'),
 ('atlas_experiences','public.atlas_categories'),('atlas_visits','public.atlas_experiences'),
 ('atlas_reviews','public.atlas_visits'),('atlas_trips','public.atlas_maps'),
 ('atlas_imports','public.atlas_maps'),('atlas_connections','public.atlas_maps'),
 ('atlas_connection_requests','auth.users')
)
select 'foreign_key' as kind,child||' -> '||parent as component,exists(
 select 1 from pg_constraint where contype='f' and convalidated
 and conrelid=to_regclass('public.'||e.child) and confrelid=to_regclass(e.parent)
) as ok from expected e order by child,parent;

select 'storage_private' as kind,v.id as component,
 exists(select 1 from storage.buckets b where b.id=v.id and b.public=false) as ok
from (values ('atlas-images'),('atlas-avatars')) v(id);

with expected(policy_name) as (values ('atlas_image_read'),('atlas_image_insert'),('atlas_avatar_read'),('atlas_avatar_insert'))
select 'storage_policy' as kind,policy_name as component,
 exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname=e.policy_name) as ok
from expected e;
