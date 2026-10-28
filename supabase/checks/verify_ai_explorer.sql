-- Read-only check, after applying ONLY the new AI migration.
select 'AI usage private' as component,
       c.relrowsecurity and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as ok
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='atlas_private' and c.relname in ('ai_usage','ai_requests');
select p.oid::regprocedure::text as component,
       p.prosecdef and not has_function_privilege('authenticated',p.oid,'EXECUTE')
       and not has_function_privilege('anon',p.oid,'EXECUTE')
       and has_function_privilege('service_role',p.oid,'EXECUTE') as ok
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('atlas_ai_begin','atlas_ai_finish');
-- Expect four rows, all ok=true. No requests, no OpenAI costs, no data changes.
