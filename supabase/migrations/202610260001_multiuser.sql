-- ATLAS multiutente. Compatibile con le due migrazioni storiche: namespace atlas_* separato.
-- INSTALLAZIONE ATTUALE: eseguire questo file per primo, interamente e una sola volta.
-- Autonomo: le migrazioni 20261023 non sono prerequisiti del modello atlas_*.
-- Le vecchie tabelle NON vengono importate né eliminate automaticamente.
begin;
create schema if not exists atlas_private;
revoke all on schema atlas_private from public, anon;
grant usage on schema atlas_private to authenticated;
create table public.atlas_profiles(
 id uuid primary key references auth.users on delete cascade,
 display_name text not null check(length(trim(display_name)) between 1 and 80),
 username text not null unique check(username ~ '^[a-z0-9_]{3,20}$'),
 avatar_path text, created_at timestamptz not null default now(),
 check(avatar_path is null or split_part(avatar_path,'/',1)=id::text)
);
create index atlas_username_prefix on public.atlas_profiles(username text_pattern_ops);
create table public.atlas_maps(
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 100),
 type text not null check(type in ('personal','shared')), created_by uuid not null references auth.users,
 created_at timestamptz not null default now()
);
create unique index atlas_one_personal on public.atlas_maps(created_by) where type='personal';
create table public.atlas_map_members(
 map_id uuid not null references public.atlas_maps on delete cascade,
 user_id uuid not null references auth.users on delete cascade, role text not null check(role in ('owner','editor')),
 joined_at timestamptz not null default now(), primary key(map_id,user_id)
);
create index atlas_members_user on public.atlas_map_members(user_id,map_id);
create table public.atlas_connection_requests(
 id uuid primary key default gen_random_uuid(),sender_id uuid not null references auth.users,
 recipient_id uuid not null references auth.users, status text not null default 'pending' check(status in ('pending','accepted','rejected','cancelled')),
 created_at timestamptz not null default now(),responded_at timestamptz,check(sender_id<>recipient_id)
);
create unique index atlas_pending_pair on public.atlas_connection_requests(least(sender_id,recipient_id),greatest(sender_id,recipient_id)) where status='pending';
create index atlas_requests_recipient on public.atlas_connection_requests(recipient_id,created_at desc);
create index atlas_requests_sender on public.atlas_connection_requests(sender_id,created_at desc);
create table public.atlas_connections(
 id uuid primary key default gen_random_uuid(),user_a_id uuid not null references auth.users,user_b_id uuid not null references auth.users,
 map_id uuid not null unique references public.atlas_maps,created_at timestamptz not null default now(),
 unique(user_a_id,user_b_id),check(user_a_id<user_b_id)
);
create table public.atlas_categories(
 map_id uuid not null references public.atlas_maps,id text not null check(length(id) between 1 and 100),
 name text not null check(length(trim(name)) between 1 and 60),icon text not null check(length(icon)<=40),
 color text not null check(color ~ '^#[0-9a-fA-F]{6}$'),is_default boolean not null default false,
 primary key(map_id,id)
);
create unique index atlas_category_name on public.atlas_categories(map_id,lower(name));
create table public.atlas_experiences(
 id uuid primary key,map_id uuid not null references public.atlas_maps,
 created_by uuid not null default auth.uid() references auth.users,
 category_id text not null,data jsonb not null,image_path text,deleted_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(map_id,id),
 foreign key(map_id,category_id) references public.atlas_categories(map_id,id),
 check(length(trim(data->>'title')) between 1 and 160),check(data ?& array['title','address','latitude','longitude','status','environment']),
 check(length(trim(data->>'address')) between 1 and 500),check(length(coalesce(data->>'description',''))<=5000),
 check((data->>'latitude')::numeric between -85.051129 and 85.051129),check((data->>'longitude')::numeric between -180 and 180),
 check(data->>'status' in ('TO_DO','DONE')),check(data->>'environment' in ('INDOOR','OUTDOOR','MIXED')),
 check((data->>'status'='TO_DO' and data->>'priority' in ('LOW','MEDIUM','HIGH')) or (data->>'status'='DONE' and data->>'priority' is null)),
 check(image_path is null or split_part(image_path,'/',1)=map_id::text),
 check(not(data ? 'imageUrl') or data->>'imageUrl' is null)
);
create index atlas_experiences_map on public.atlas_experiences(map_id,updated_at desc);
create table public.atlas_visits(
 id uuid primary key,map_id uuid not null,experience_id uuid not null,user_id uuid not null default auth.uid() references auth.users,
 visited_at date,created_at timestamptz not null default now(),unique(map_id,experience_id,id),
 foreign key(map_id,experience_id) references public.atlas_experiences(map_id,id)
);
create table public.atlas_reviews(
 id uuid primary key,map_id uuid not null,experience_id uuid not null,author_id uuid not null default auth.uid() references auth.users,
 visit_id uuid not null,rating numeric check(rating between 0 and 5 and mod(rating*2,1)=0),notes text not null default '' check(length(notes)<=5000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(map_id,experience_id,visit_id) references public.atlas_visits(map_id,experience_id,id),
 unique(visit_id,author_id)
);
create index atlas_reviews_map on public.atlas_reviews(map_id,experience_id);
create table public.atlas_trips(
 id uuid primary key,map_id uuid not null references public.atlas_maps,created_by uuid not null default auth.uid() references auth.users,
 name text not null check(length(trim(name)) between 1 and 120),data jsonb not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index atlas_trips_map on public.atlas_trips(map_id);
create table public.atlas_imports(
 user_id uuid not null default auth.uid() references auth.users,source_id text not null,map_id uuid not null references public.atlas_maps,
 completed_at timestamptz not null default now(),primary key(user_id,source_id)
);
create table atlas_private.rate_limits(user_id uuid not null,action text not null,window_start timestamptz not null default now(),count int not null default 1,primary key(user_id,action));
alter table atlas_private.rate_limits enable row level security;
revoke all on atlas_private.rate_limits from public,anon,authenticated;
create function atlas_private.member(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.atlas_map_members where map_id=target and user_id=auth.uid()); $$;
create function atlas_private.visible_profile(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select target=auth.uid() or exists(select 1 from public.atlas_map_members a join public.atlas_map_members b using(map_id) where a.user_id=auth.uid() and b.user_id=target)
 or exists(select 1 from public.atlas_connection_requests where (sender_id=auth.uid() and recipient_id=target) or (recipient_id=auth.uid() and sender_id=target)); $$;
create function atlas_private.limit_action(action_name text, maximum int) returns void language plpgsql security definer set search_path='' as $$
 declare n int;begin
 if auth.uid() is null then raise exception 'Autenticazione richiesta';end if;
 insert into atlas_private.rate_limits(user_id,action) values(auth.uid(),action_name)
 on conflict(user_id,action) do update set count=case when rate_limits.window_start<now()-interval '1 minute' then 1 else rate_limits.count+1 end,
 window_start=case when rate_limits.window_start<now()-interval '1 minute' then now() else rate_limits.window_start end returning count into n;
 if n>maximum then raise exception 'Troppe richieste. Attendi un minuto.';end if;
 end;$$;
-- Solo trigger e RPC controllate assegnano membri/proprietari.
create function atlas_private.seed_categories(target uuid) returns void language plpgsql set search_path='' as $$ begin
 insert into public.atlas_categories(map_id,id,name,icon,color,is_default) values
 (target,'Food','Cibo','utensils','#FF8D87',true),(target,'Experience','Esperienze','sparkles','#B9A5F8',true),
 (target,'Walks','Passeggiate','footprints','#9CDDCF',true),(target,'Nature','Natura','trees','#98D58C',true),
 (target,'Culture','Cultura','landmark','#FFD47E',true),(target,'Travel','Viaggi','plane','#B9A5F8',true),
 (target,'Shopping','Shopping','shopping','#EFA6C8',true),(target,'Nightlife','Vita notturna','moon','#B9A5F8',true),(target,'Other','Altro','map-pin','#77717E',true);
 end;$$;
create function atlas_private.on_signup() returns trigger language plpgsql security definer set search_path='' as $$
 declare mid uuid;begin
 if new.is_anonymous then raise exception 'Account anonimi non supportati';end if;
 insert into public.atlas_profiles(id,display_name,username) values(new.id,trim(new.raw_user_meta_data->>'display_name'),lower(new.raw_user_meta_data->>'username'));
 insert into public.atlas_maps(name,type,created_by) values('La mia mappa','personal',new.id) returning id into mid;
 insert into public.atlas_map_members(map_id,user_id,role) values(mid,new.id,'owner');
 perform atlas_private.seed_categories(mid);return new;end;$$;
create trigger atlas_signup after insert on auth.users for each row execute function atlas_private.on_signup();
-- Protegge ID, map_id e autori anche da richieste dirette.
create function atlas_private.immutable_identity() returns trigger language plpgsql set search_path='' as $$ begin
 if (to_jsonb(new)->'id') is distinct from (to_jsonb(old)->'id') or (to_jsonb(new)->'map_id') is distinct from (to_jsonb(old)->'map_id')
 or (to_jsonb(new)->'created_by') is distinct from (to_jsonb(old)->'created_by') or (to_jsonb(new)->'author_id') is distinct from (to_jsonb(old)->'author_id')
 or (to_jsonb(new)->'user_id') is distinct from (to_jsonb(old)->'user_id') or (to_jsonb(new)->'created_at') is distinct from (to_jsonb(old)->'created_at')
 or (to_jsonb(new)->'experience_id') is distinct from (to_jsonb(old)->'experience_id') or (to_jsonb(new)->'visit_id') is distinct from (to_jsonb(old)->'visit_id')
 then raise exception 'Identità e appartenenza non modificabili';end if;return new;end;$$;
create function atlas_private.profile_identity() returns trigger language plpgsql set search_path='' as $$ begin
 if new.id<>old.id or new.username<>old.username or new.created_at<>old.created_at then raise exception 'Username immutabile';end if;return new;end;$$;
create trigger atlas_profile_identity before update on public.atlas_profiles for each row execute function atlas_private.profile_identity();
create trigger atlas_experiences_identity before update on public.atlas_experiences for each row execute function atlas_private.immutable_identity();
create trigger atlas_categories_identity before update on public.atlas_categories for each row execute function atlas_private.immutable_identity();
create trigger atlas_visits_identity before update on public.atlas_visits for each row execute function atlas_private.immutable_identity();
create trigger atlas_reviews_identity before update on public.atlas_reviews for each row execute function atlas_private.immutable_identity();
create trigger atlas_trips_identity before update on public.atlas_trips for each row execute function atlas_private.immutable_identity();
alter table public.atlas_profiles enable row level security;
revoke all on public.atlas_profiles from public,anon,authenticated;
grant select on public.atlas_profiles to authenticated;
alter table public.atlas_maps enable row level security;
revoke all on public.atlas_maps from public,anon,authenticated;
grant select on public.atlas_maps to authenticated;
alter table public.atlas_map_members enable row level security;
revoke all on public.atlas_map_members from public,anon,authenticated;
grant select on public.atlas_map_members to authenticated;
alter table public.atlas_connection_requests enable row level security;
revoke all on public.atlas_connection_requests from public,anon,authenticated;
grant select on public.atlas_connection_requests to authenticated;
alter table public.atlas_connections enable row level security;
revoke all on public.atlas_connections from public,anon,authenticated;
grant select on public.atlas_connections to authenticated;
alter table public.atlas_categories enable row level security;
revoke all on public.atlas_categories from public,anon,authenticated;
grant select on public.atlas_categories to authenticated;
alter table public.atlas_experiences enable row level security;
revoke all on public.atlas_experiences from public,anon,authenticated;
grant select on public.atlas_experiences to authenticated;
alter table public.atlas_visits enable row level security;
revoke all on public.atlas_visits from public,anon,authenticated;
grant select on public.atlas_visits to authenticated;
alter table public.atlas_reviews enable row level security;
revoke all on public.atlas_reviews from public,anon,authenticated;
grant select on public.atlas_reviews to authenticated;
alter table public.atlas_trips enable row level security;
revoke all on public.atlas_trips from public,anon,authenticated;
grant select on public.atlas_trips to authenticated;
alter table public.atlas_imports enable row level security;
revoke all on public.atlas_imports from public,anon,authenticated;
grant select on public.atlas_imports to authenticated;
create policy atlas_profile_read on public.atlas_profiles for select to authenticated using(atlas_private.visible_profile(id));
grant update(display_name,avatar_path) on public.atlas_profiles to authenticated;
create policy atlas_profile_update on public.atlas_profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy atlas_maps_read on public.atlas_maps for select to authenticated using(atlas_private.member(id));
create policy atlas_map_members_read on public.atlas_map_members for select to authenticated using(atlas_private.member(map_id));
create policy atlas_connection_requests_read on public.atlas_connection_requests for select to authenticated using(auth.uid() in (sender_id,recipient_id));
create policy atlas_connections_read on public.atlas_connections for select to authenticated using(auth.uid() in (user_a_id,user_b_id));
create policy atlas_imports_read on public.atlas_imports for select to authenticated using(user_id=auth.uid() and atlas_private.member(map_id));
create policy atlas_categories_read on public.atlas_categories for select to authenticated using(atlas_private.member(map_id));
grant insert,update on public.atlas_categories to authenticated;
create policy atlas_categories_insert on public.atlas_categories for insert to authenticated with check(atlas_private.member(map_id));
create policy atlas_categories_update on public.atlas_categories for update to authenticated using(atlas_private.member(map_id)) with check(atlas_private.member(map_id));
create policy atlas_experiences_read on public.atlas_experiences for select to authenticated using(atlas_private.member(map_id));
grant insert,update on public.atlas_experiences to authenticated;
create policy atlas_experiences_insert on public.atlas_experiences for insert to authenticated with check(atlas_private.member(map_id) and created_by=auth.uid());
create policy atlas_experiences_update on public.atlas_experiences for update to authenticated using(atlas_private.member(map_id)) with check(atlas_private.member(map_id));
create policy atlas_visits_read on public.atlas_visits for select to authenticated using(atlas_private.member(map_id));
grant insert,update on public.atlas_visits to authenticated;
create policy atlas_visits_insert on public.atlas_visits for insert to authenticated with check(atlas_private.member(map_id) and user_id=auth.uid());
create policy atlas_visits_update on public.atlas_visits for update to authenticated using(atlas_private.member(map_id) and user_id=auth.uid()) with check(atlas_private.member(map_id) and user_id=auth.uid());
create policy atlas_reviews_read on public.atlas_reviews for select to authenticated using(atlas_private.member(map_id));
grant insert,update,delete on public.atlas_reviews to authenticated;
create policy atlas_reviews_insert on public.atlas_reviews for insert to authenticated with check(atlas_private.member(map_id) and author_id=auth.uid());
create policy atlas_reviews_update on public.atlas_reviews for update to authenticated using(atlas_private.member(map_id) and author_id=auth.uid()) with check(atlas_private.member(map_id) and author_id=auth.uid());
create policy atlas_reviews_delete on public.atlas_reviews for delete to authenticated using(atlas_private.member(map_id) and author_id=auth.uid());
create policy atlas_trips_read on public.atlas_trips for select to authenticated using(atlas_private.member(map_id));
grant insert,update,delete on public.atlas_trips to authenticated;
create policy atlas_trips_insert on public.atlas_trips for insert to authenticated with check(atlas_private.member(map_id) and created_by=auth.uid());
create policy atlas_trips_update on public.atlas_trips for update to authenticated using(atlas_private.member(map_id)) with check(atlas_private.member(map_id));
create policy atlas_trips_delete on public.atlas_trips for delete to authenticated using(atlas_private.member(map_id));
create function atlas_private.search_users(q text) returns setof public.atlas_profiles language plpgsql security definer set search_path='' as $$ begin
 perform atlas_private.limit_action('search',20);
 if q !~ '^[a-z0-9_]{3,20}$' then raise exception 'Inserisci almeno tre caratteri dello username';end if;
 return query select * from public.atlas_profiles where id<>auth.uid() and left(username,length(q))=q order by username limit 10;end;$$;
create function public.atlas_search_users(q text) returns setof public.atlas_profiles language sql security invoker set search_path='' as $$select * from atlas_private.search_users(lower(q));$$;
create function atlas_private.send_request(recipient uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 perform atlas_private.limit_action('request',5);
 if recipient=auth.uid() or not exists(select 1 from public.atlas_profiles where id=recipient) then raise exception 'Destinatario non valido';end if;
 perform pg_advisory_xact_lock(hashtextextended(least(auth.uid(),recipient)::text||greatest(auth.uid(),recipient)::text,0));
 if exists(select 1 from public.atlas_connections where user_a_id=least(auth.uid(),recipient) and user_b_id=greatest(auth.uid(),recipient)) then raise exception 'Siete già collegati';end if;
 if exists(select 1 from public.atlas_connection_requests where least(sender_id,recipient_id)=least(auth.uid(),recipient) and greatest(sender_id,recipient_id)=greatest(auth.uid(),recipient) and created_at>now()-interval '1 day') then raise exception 'Richiesta già inviata. Attendi 24 ore.';end if;
 insert into public.atlas_connection_requests(sender_id,recipient_id) values(auth.uid(),recipient);end;$$;
create function public.atlas_send_request(recipient uuid) returns void language sql security invoker set search_path='' as $$select atlas_private.send_request(recipient);$$;
create function atlas_private.respond_request(request_id uuid,decision text) returns uuid language plpgsql security definer set search_path='' as $$
 declare r public.atlas_connection_requests;mid uuid;names text;begin
 select * into r from public.atlas_connection_requests where id=request_id for update;
 if r.id is null or r.status<>'pending' or auth.uid() is null then raise exception 'Richiesta non disponibile';end if;
 if (decision in ('accepted','rejected') and r.recipient_id<>auth.uid()) or (decision='cancelled' and r.sender_id<>auth.uid()) or decision not in ('accepted','rejected','cancelled') then raise exception 'Operazione non autorizzata';end if;
 if decision='accepted' then
 perform pg_advisory_xact_lock(hashtextextended(least(r.sender_id,r.recipient_id)::text||greatest(r.sender_id,r.recipient_id)::text,0));
 select map_id into mid from public.atlas_connections where user_a_id=least(r.sender_id,r.recipient_id) and user_b_id=greatest(r.sender_id,r.recipient_id);
 if mid is null then
 select string_agg(display_name,' e ' order by id) into names from public.atlas_profiles where id in(r.sender_id,r.recipient_id);
 insert into public.atlas_maps(name,type,created_by) values(left('La mappa di '||names,100),'shared',r.sender_id) returning id into mid;
 insert into public.atlas_map_members(map_id,user_id,role) values(mid,r.sender_id,'owner'),(mid,r.recipient_id,'editor');
 perform atlas_private.seed_categories(mid);
 insert into public.atlas_connections(user_a_id,user_b_id,map_id) values(least(r.sender_id,r.recipient_id),greatest(r.sender_id,r.recipient_id),mid);
 end if;end if;
 update public.atlas_connection_requests set status=decision,responded_at=now() where id=r.id;return mid;end;$$;
create function public.atlas_respond_request(request_id uuid,decision text) returns uuid language sql security invoker set search_path='' as $$select atlas_private.respond_request(request_id,decision);$$;
create function atlas_private.manage_map(target uuid,new_name text,leave_map boolean) returns void language plpgsql security definer set search_path='' as $$
 declare m public.atlas_maps;successor uuid;begin
 select * into m from public.atlas_maps where id=target for update;
 if not atlas_private.member(target) then raise exception 'Accesso negato';end if;
 if leave_map then
 if m.type<>'shared' then raise exception 'Non puoi abbandonare la mappa personale';end if;
 select user_id into successor from public.atlas_map_members where map_id=target and user_id<>auth.uid() order by joined_at limit 1;
 if m.created_by=auth.uid() and successor is not null then update public.atlas_maps set created_by=successor where id=target;update public.atlas_map_members set role='owner' where map_id=target and user_id=successor;end if;
 delete from public.atlas_map_members where map_id=target and user_id=auth.uid();
 else update public.atlas_maps set name=trim(new_name) where id=target;end if;end;$$;
create function public.atlas_manage_map(target uuid,new_name text default null,leave_map boolean default false) returns void language sql security invoker set search_path='' as $$select atlas_private.manage_map(target,new_name,leave_map);$$;
-- Recensione: visita e recensione nella stessa transazione; autore sempre auth.uid().
create function public.atlas_save_review(target uuid,experience uuid,draft jsonb) returns void language plpgsql security invoker set search_path='' as $$
 declare rid uuid:=coalesce((draft->>'id')::uuid,gen_random_uuid());vid uuid;begin
 if not atlas_private.member(target) or not exists(select 1 from public.atlas_experiences where map_id=target and id=experience and deleted_at is null and (data->>'status'='DONE' or draft->>'id' is not null)) then raise exception 'Esperienza non disponibile';end if;
 select visit_id into vid from public.atlas_reviews where id=rid and map_id=target and author_id=auth.uid() and experience_id=experience;
 if draft->>'id' is not null and vid is null then raise exception 'Puoi modificare soltanto le tue recensioni';end if;
 vid:=coalesce(vid,gen_random_uuid());
 insert into public.atlas_visits(id,map_id,experience_id,user_id,visited_at) values(vid,target,experience,auth.uid(),(draft->>'visitedAt')::date)
 on conflict(id) do update set visited_at=excluded.visited_at;
 insert into public.atlas_reviews(id,map_id,experience_id,author_id,visit_id,rating,notes) values(rid,target,experience,auth.uid(),vid,(draft->>'rating')::numeric,coalesce(draft->>'notes',''))
 on conflict(id) do update set rating=excluded.rating,notes=excluded.notes,updated_at=now();end;$$;
create function public.atlas_save_experience(target uuid,item jsonb,review jsonb default null) returns void language plpgsql security invoker set search_path='' as $$ begin
 insert into public.atlas_experiences(id,map_id,category_id,data,image_path) values((item->>'id')::uuid,target,item->>'category',jsonb_set(item,'{environment}',to_jsonb(coalesce(item->>'environment','MIXED'))),item->>'imagePath')
 on conflict(id) do update set category_id=excluded.category_id,data=excluded.data,image_path=excluded.image_path,updated_at=now()
 where atlas_experiences.map_id=target;
 if not found then raise exception 'ID appartenente a una mappa diversa';end if;
 if review is not null then perform public.atlas_save_review(target,(item->>'id')::uuid,review);end if;end;$$;
create function public.atlas_save_trip(target uuid,item jsonb) returns void language plpgsql security invoker set search_path='' as $$
 declare w jsonb;begin
 if jsonb_typeof(item->'waypoints')<>'array' or jsonb_array_length(item->'waypoints')>100 then raise exception 'Tappe non valide';end if;
 for w in select * from jsonb_array_elements(item->'waypoints') loop
 if (w->>'stopMinutes')::numeric not between 0 and 1440 or not exists(select 1 from public.atlas_experiences where id=(w->>'experienceId')::uuid and map_id=target and deleted_at is null) then raise exception 'Tappa non disponibile in questa mappa';end if;
 end loop;
 insert into public.atlas_trips(id,map_id,name,data) values((item->>'id')::uuid,target,item->>'name',item)
 on conflict(id) do update set name=excluded.name,data=excluded.data,updated_at=now() where atlas_trips.map_id=target;
 if not found then raise exception 'Viaggio appartenente a un’altra mappa';end if;end;$$;
create function atlas_private.remove_category(target uuid,category text,replacement text) returns void language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.atlas_maps where id=target for update;
 if not atlas_private.member(target) then raise exception 'Accesso negato';end if;
 if (select count(*) from public.atlas_categories where map_id=target)<=1 then raise exception 'Mantieni almeno una categoria';end if;
 if exists(select 1 from public.atlas_experiences where map_id=target and category_id=category) then
 if replacement is null or replacement=category or not exists(select 1 from public.atlas_categories where map_id=target and id=replacement) then raise exception 'Scegli una categoria sostitutiva';end if;
 update public.atlas_experiences set category_id=replacement,data=jsonb_set(jsonb_set(data,'{category}',to_jsonb(replacement)),'{categoryId}',to_jsonb(replacement)),updated_at=now() where map_id=target and category_id=category;
 end if;
 delete from public.atlas_categories where map_id=target and id=category;end;$$;
create function public.atlas_remove_category(target uuid,category text,replacement text default null) returns void language sql security invoker set search_path='' as $$select atlas_private.remove_category(target,category,replacement);$$;
create function atlas_private.import_legacy(target uuid,source_id text,bundle jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare x jsonb;begin
 if not atlas_private.member(target) or length(source_id)>100 then raise exception 'Accesso negato';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||source_id,0));
 if exists(select 1 from public.atlas_imports where user_id=auth.uid() and atlas_imports.source_id=import_legacy.source_id) then raise exception 'Archivio già importato';end if;
 if octet_length(bundle::text)>10000000 or jsonb_array_length(bundle->'experiences')>1000 then raise exception 'Import troppo grande: massimo 1000 luoghi';end if;
 for x in select * from jsonb_array_elements(bundle->'categories') loop
 insert into public.atlas_categories(map_id,id,name,icon,color,is_default) values(target,x->>'id',x->>'name',x->>'icon',x->>'color',false);end loop;
 for x in select * from jsonb_array_elements(bundle->'experiences') loop
 if exists(select 1 from public.atlas_experiences where id=(x->>'id')::uuid) then raise exception 'ID import già esistente';end if;
 perform public.atlas_save_experience(target,x,null);end loop;
 for x in select * from jsonb_array_elements(bundle->'reviews') loop
 if not exists(select 1 from jsonb_array_elements(bundle->'experiences') e where e->>'id'=x->>'experienceId') then raise exception 'Recensione estranea all’import';end if;
 insert into public.atlas_visits(id,map_id,experience_id,user_id,visited_at) values((x->>'visitId')::uuid,target,(x->>'experienceId')::uuid,auth.uid(),(x->>'visitedAt')::date);
 insert into public.atlas_reviews(id,map_id,experience_id,author_id,visit_id,rating,notes) values((x->>'id')::uuid,target,(x->>'experienceId')::uuid,auth.uid(),(x->>'visitId')::uuid,(x->>'rating')::numeric,x->>'notes');end loop;
 for x in select * from jsonb_array_elements(bundle->'trips') loop
 if exists(select 1 from public.atlas_trips where id=(x->>'id')::uuid) then raise exception 'Viaggio già esistente';end if;
 if exists(select 1 from jsonb_array_elements(x->'waypoints') w where not exists(select 1 from jsonb_array_elements(bundle->'experiences') e where e->>'id'=w->>'experienceId')) then raise exception 'Tappa estranea all’import';end if;
 perform public.atlas_save_trip(target,x);end loop;
 insert into public.atlas_imports(user_id,source_id,map_id) values(auth.uid(),source_id,target);end;$$;
create function public.atlas_import_legacy(target uuid,source_id text,bundle jsonb) returns void language sql security invoker set search_path='' as $$select atlas_private.import_legacy(target,source_id,bundle);$$;
-- Valida anche scritture REST dirette, non solo RPC.
create function atlas_private.validate_payload() returns trigger language plpgsql set search_path='' as $$
 declare w jsonb;begin
 if tg_table_name='atlas_experiences' then
 if new.data->>'category' is distinct from new.category_id or new.data->>'id' is distinct from new.id::text
 or new.data->>'imagePath' is distinct from new.image_path
 or new.data->>'title' is null or new.data->>'address' is null or new.data->>'latitude' is null or new.data->>'longitude' is null
 or new.data->>'status' is null or new.data->>'environment' is null
 or (new.data->>'status'='TO_DO' and new.data->>'priority' is null) then raise exception 'Dati esperienza non validi';end if;
 new.data:=new.data - 'imageUrl';
 elsif tg_table_name='atlas_trips' then
 if new.data->>'id' is distinct from new.id::text or new.data->>'name' is distinct from new.name or jsonb_typeof(new.data->'waypoints') is distinct from 'array' or jsonb_array_length(new.data->'waypoints')>100 then raise exception 'Viaggio non valido';end if;
 for w in select * from jsonb_array_elements(new.data->'waypoints') loop
 if w->>'stopMinutes' is null or (w->>'stopMinutes')::numeric not between 0 and 1440 or not exists(select 1 from public.atlas_experiences where map_id=new.map_id and id=(w->>'experienceId')::uuid and deleted_at is null) then raise exception 'Tappa non valida per questa mappa';end if;end loop;
 end if;return new;end;$$;
create trigger atlas_experience_payload before insert or update on public.atlas_experiences for each row execute function atlas_private.validate_payload();
create trigger atlas_trip_payload before insert or update on public.atlas_trips for each row execute function atlas_private.validate_payload();
-- Impedisce di collegare una recensione alla visita di un altro membro.
create function atlas_private.review_author() returns trigger language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from public.atlas_visits where id=new.visit_id and map_id=new.map_id and experience_id=new.experience_id and user_id=new.author_id) then raise exception 'Autore visita non valido';end if;return new;end;$$;
create trigger atlas_review_author before insert or update on public.atlas_reviews for each row execute function atlas_private.review_author();
-- Bucket PRIVATI, nessuna cache del contenuto in service worker.
-- Non riutilizzare silenziosamente un bucket omonimo già pubblico: RLS non rende private le sue URL pubbliche.
do $$ begin
 if exists(select 1 from storage.buckets where id in ('atlas-images','atlas-avatars') and public=true) then
   raise exception 'Un bucket ATLAS esistente è pubblico. Verifica e rendi privato il bucket prima di applicare la migrazione; nessun dato è stato eliminato';
 end if;
end;$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('atlas-images','atlas-images',false,8388608,array['image/jpeg','image/png','image/webp']),
 ('atlas-avatars','atlas-avatars',false,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy atlas_image_read on storage.objects for select to authenticated using(bucket_id='atlas-images' and atlas_private.member((storage.foldername(name))[1]::uuid));
create policy atlas_image_insert on storage.objects for insert to authenticated with check(bucket_id='atlas-images' and atlas_private.member((storage.foldername(name))[1]::uuid) and (storage.foldername(name))[2]=auth.uid()::text);
create policy atlas_avatar_read on storage.objects for select to authenticated using(bucket_id='atlas-avatars' and atlas_private.visible_profile((storage.foldername(name))[1]::uuid));
create policy atlas_avatar_insert on storage.objects for insert to authenticated with check(bucket_id='atlas-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
-- Nessuna policy update: URL nuove per sostituire foto, nessun overwrite cross-user.
revoke all on all functions in schema atlas_private from public,anon,authenticated;
grant execute on function atlas_private.member(uuid),atlas_private.visible_profile(uuid),atlas_private.search_users(text),atlas_private.send_request(uuid),atlas_private.respond_request(uuid,text),atlas_private.manage_map(uuid,text,boolean),atlas_private.remove_category(uuid,text,text),atlas_private.import_legacy(uuid,text,jsonb) to authenticated;
revoke all on function public.atlas_search_users(text) from public,anon;
grant execute on function public.atlas_search_users(text) to authenticated;
revoke all on function public.atlas_send_request(uuid) from public,anon;
grant execute on function public.atlas_send_request(uuid) to authenticated;
revoke all on function public.atlas_respond_request(uuid,text) from public,anon;
grant execute on function public.atlas_respond_request(uuid,text) to authenticated;
revoke all on function public.atlas_manage_map(uuid,text,boolean) from public,anon;
grant execute on function public.atlas_manage_map(uuid,text,boolean) to authenticated;
revoke all on function public.atlas_save_review(uuid,uuid,jsonb) from public,anon;
grant execute on function public.atlas_save_review(uuid,uuid,jsonb) to authenticated;
revoke all on function public.atlas_save_experience(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.atlas_save_experience(uuid,jsonb,jsonb) to authenticated;
revoke all on function public.atlas_save_trip(uuid,jsonb) from public,anon;
grant execute on function public.atlas_save_trip(uuid,jsonb) to authenticated;
revoke all on function public.atlas_remove_category(uuid,text,text) from public,anon;
grant execute on function public.atlas_remove_category(uuid,text,text) to authenticated;
revoke all on function public.atlas_import_legacy(uuid,text,jsonb) from public,anon;
grant execute on function public.atlas_import_legacy(uuid,text,jsonb) to authenticated;
-- Realtime facoltativo: autorizzazione resta RLS, polling client come fallback.
do $$ declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['atlas_experiences','atlas_categories','atlas_reviews','atlas_visits','atlas_trips','atlas_map_members','atlas_connection_requests'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
 end loop;end if;end;$$;
commit;
