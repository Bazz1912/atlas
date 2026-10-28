-- Predisposizione futura. Non applicata a servizi remoti da questa sessione.
-- Richiede 202610230001_initial.sql. Il frontend avanzato usa ancora IndexedDB.
begin;
create table public.categories (
  id text not null,
  workspace_id uuid not null references public.workspaces(id),
  slug text not null check (char_length(slug) between 1 and 100),
  name text not null check (char_length(trim(name)) between 1 and 60),
  icon text not null,
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_default boolean not null default false,
  primary key (id, workspace_id),
  unique (workspace_id, slug)
);
create unique index categories_name_unique on public.categories(workspace_id, lower(name));
create function public.protect_category_identity() returns trigger language plpgsql set search_path='' as $$
begin
  if new.id<>old.id or new.workspace_id<>old.workspace_id or new.slug<>old.slug or new.is_default<>old.is_default then
    raise exception 'Identità della categoria non modificabile';
  end if;
  return new;
end;
$$;
create trigger category_identity before update on public.categories for each row execute function public.protect_category_identity();
insert into public.categories(id,workspace_id,slug,name,icon,color,is_default)
select defaults.id,w.id,lower(defaults.id),defaults.name,defaults.icon,defaults.color,true
from public.workspaces w cross join (values
  ('Food','Cibo','utensils','#ff9c7d'),
  ('Experience','Esperienze','sparkles','#b5a3ff'),
  ('Walks','Passeggiate','footprints','#79dfca'),
  ('Nature','Natura','trees','#98d58c'),
  ('Culture','Cultura','landmark','#f2ce78'),
  ('Travel','Viaggi','plane','#88b7ff'),
  ('Shopping','Shopping','shopping','#f2a0cf'),
  ('Nightlife','Vita notturna','moon','#ab9ffa'),
  ('Other','Altro','map-pin','#a9bad1')
) as defaults(id,name,icon,color);

alter table public.experiences add column category_id text;
update public.experiences set category_id = category;
alter table public.experiences alter column category_id set not null;
alter table public.experiences add constraint experience_category_fk foreign key (category_id, workspace_id) references public.categories(id,workspace_id) on delete restrict;
-- Mantiene la colonna storica durante il passaggio degli adapter; i nuovi adapter useranno category_id.
alter table public.experiences drop constraint if exists experiences_category_check;
alter table public.experiences alter column category drop not null;
alter table public.experiences add column environment text not null default 'MIXED' check (environment in ('INDOOR','OUTDOOR','MIXED'));
alter table public.experiences add column deleted_at timestamptz;
create index experiences_active_filters on public.experiences(workspace_id,category_id,status,environment) where deleted_at is null;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  name text not null check (char_length(trim(name)) between 1 and 120),
  origin jsonb,
  travel_date date,
  route_summary jsonb,
  planning_preferences jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create table public.trip_waypoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  trip_id uuid not null,
  experience_id uuid not null,
  position integer not null check (position >= 0),
  stop_minutes integer not null default 60 check (stop_minutes between 0 and 1440),
  foreign key (trip_id,workspace_id) references public.trips(id,workspace_id) on delete cascade,
  foreign key (experience_id,workspace_id) references public.experiences(id,workspace_id) on delete restrict,
  unique (trip_id,position),
  unique (trip_id,experience_id)
);
create index trip_waypoints_experience on public.trip_waypoints(experience_id);
create table public.saved_origins (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  label text not null check (char_length(label) between 1 and 80),
  address text not null,
  latitude double precision not null check (latitude between -85.051129 and 85.051129),
  longitude double precision not null check (longitude between -180 and 180)
);
alter table public.categories enable row level security;
alter table public.trips enable row level security;
alter table public.trip_waypoints enable row level security;
alter table public.saved_origins enable row level security;
create policy category_read on public.categories for select to authenticated using (public.is_workspace_member(workspace_id));
create policy category_insert on public.categories for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy category_update on public.categories for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy trip_read on public.trips for select to authenticated using (public.is_workspace_member(workspace_id));
create policy trip_insert on public.trips for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
create policy trip_update on public.trips for update to authenticated using (public.is_workspace_member(workspace_id) and created_by = (select auth.uid())) with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
create policy trip_delete on public.trips for delete to authenticated using (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
create policy waypoint_read on public.trip_waypoints for select to authenticated using (public.is_workspace_member(workspace_id));
create policy waypoint_write on public.trip_waypoints for all to authenticated using (exists (select 1 from public.trips where id=trip_id and workspace_id=trip_waypoints.workspace_id and created_by=(select auth.uid()))) with check (exists (select 1 from public.trips where id=trip_id and workspace_id=trip_waypoints.workspace_id and created_by=(select auth.uid())));
create policy origins_private on public.saved_origins for all to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
revoke all on public.categories,public.trips,public.trip_waypoints,public.saved_origins from anon,authenticated;
grant select,insert,update on public.categories to authenticated;
grant select,insert,update,delete on public.trips,public.trip_waypoints,public.saved_origins to authenticated;

-- Cancellazione categoria atomica con riassegnazione, inclusi luoghi archiviati.
create function public.reassign_and_delete_category(space uuid, old_id text, replacement_id text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_workspace_member(space) then raise exception 'Accesso negato'; end if;
  if old_id=replacement_id or replacement_id is null then raise exception 'Categoria sostitutiva richiesta'; end if;
  perform 1 from public.categories where workspace_id=space and id in (old_id,replacement_id) for update;
  if not exists (select 1 from public.categories where workspace_id=space and id=replacement_id) then raise exception 'Categoria sostitutiva non trovata'; end if;
  update public.experiences set category_id=replacement_id,category=replacement_id where workspace_id=space and category_id=old_id;
  delete from public.categories where workspace_id=space and id=old_id;
end;
$$;
revoke all on function public.reassign_and_delete_category(uuid,text,text) from public;
grant execute on function public.reassign_and_delete_category(uuid,text,text) to authenticated;

-- Trips riutilizza il trigger che protegge id/spazio/autore/data di creazione.
create trigger trip_identity before update on public.trips for each row execute function public.protect_experience_identity();
commit;
