-- Apply ONLY after 202610260001_multiuser.sql, once reviewed.
-- New AI usage/cache infrastructure only. No changes to existing ATLAS data or RLS.
begin;
create table atlas_private.ai_usage (
 bucket text primary key,
 minute_start timestamptz not null default now(), minute_count integer not null default 0,
 day_start date not null default (now() at time zone 'UTC')::date, day_count integer not null default 0
);
create table atlas_private.ai_requests (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, map_id uuid not null references public.atlas_maps(id) on delete cascade,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 status text not null check(status in ('processing','completed','failed')),
 response jsonb, created_at timestamptz not null default now(), expires_at timestamptz not null,
 primary key(user_id,request_id)
);
create index atlas_ai_requests_cache on atlas_private.ai_requests(user_id,map_id,fingerprint,expires_at);
alter table atlas_private.ai_usage enable row level security;
alter table atlas_private.ai_requests enable row level security;
revoke all on atlas_private.ai_usage,atlas_private.ai_requests from public,anon,authenticated;

create function public.atlas_ai_begin(actor uuid,target uuid,request_id uuid,fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u atlas_private.ai_usage; g atlas_private.ai_usage; previous atlas_private.ai_requests;
 utc_day date := (now() at time zone 'UTC')::date;
begin
 if not exists(select 1 from public.atlas_map_members where user_id=actor and map_id=target)
 or not exists(select 1 from public.atlas_maps where id=target and (type='shared' or created_by=actor))
 then return jsonb_build_object('status','forbidden');end if;
 if fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid fingerprint';end if;
 -- Global then user row lock: claims are atomic across concurrent Edge instances.
 insert into atlas_private.ai_usage(bucket) values('global') on conflict do nothing;
 select * into g from atlas_private.ai_usage where bucket='global' for update;
 insert into atlas_private.ai_usage(bucket) values(actor::text) on conflict do nothing;
 select * into u from atlas_private.ai_usage where bucket=actor::text for update;
 select * into previous from atlas_private.ai_requests r where r.user_id=actor and r.request_id=atlas_ai_begin.request_id;
 if found then
   if previous.fingerprint<>fingerprint or previous.map_id<>target then return jsonb_build_object('status','conflict');end if;
   if previous.status='completed' and previous.expires_at>now() then return jsonb_build_object('status','cached','response',previous.response);end if;
   return jsonb_build_object('status',case when previous.status='processing' and previous.expires_at>now() then 'busy' else 'expired' end);
 end if;
 select * into previous from atlas_private.ai_requests r where r.user_id=actor and r.map_id=target and r.fingerprint=atlas_ai_begin.fingerprint and r.expires_at>now() order by r.created_at desc limit 1;
 if found and previous.status='completed' then return jsonb_build_object('status','cached','response',previous.response);end if;
 if found and previous.status='processing' then return jsonb_build_object('status','busy');end if;
 if u.minute_start<now()-interval '1 minute' then u.minute_count:=0;u.minute_start:=now();end if;
 if u.day_start<>utc_day then u.day_count:=0;u.day_start:=utc_day;end if;
 if g.minute_start<now()-interval '1 minute' then g.minute_count:=0;g.minute_start:=now();end if;
 if g.day_start<>utc_day then g.day_count:=0;g.day_start:=utc_day;end if;
 if u.minute_count>=2 or u.day_count>=20 or g.minute_count>=20 or g.day_count>=200 then
   return jsonb_build_object('status','limited','retryAfter',case when u.day_count>=20 or g.day_count>=200 then 86400 else 60 end);
 end if;
 update atlas_private.ai_usage set minute_start=u.minute_start,minute_count=u.minute_count+1,day_start=u.day_start,day_count=u.day_count+1 where bucket=actor::text;
 update atlas_private.ai_usage set minute_start=g.minute_start,minute_count=g.minute_count+1,day_start=g.day_start,day_count=g.day_count+1 where bucket='global';
 -- Only expired records of this NEW temporary AI cache; no experiences/trips/reviews touched.
 delete from atlas_private.ai_requests where created_at<now()-interval '1 day';
 insert into atlas_private.ai_requests(user_id,request_id,map_id,fingerprint,status,expires_at)
 values(actor,request_id,target,fingerprint,'processing',now()+interval '2 minutes');
 return jsonb_build_object('status','claimed');
end;$$;
create function public.atlas_ai_finish(actor uuid,request_id uuid,result jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if result is not null and octet_length(result::text)>1048576 then raise exception 'AI response too large';end if;
 update atlas_private.ai_requests r set status=case when result is null then 'failed' else 'completed' end,
 response=result,expires_at=now()+interval '2 minutes'
 where r.user_id=actor and r.request_id=atlas_ai_finish.request_id and r.status='processing';
end;$$;
revoke all on function public.atlas_ai_begin(uuid,uuid,uuid,text),public.atlas_ai_finish(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.atlas_ai_begin(uuid,uuid,uuid,text),public.atlas_ai_finish(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
