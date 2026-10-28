-- ATLAS V2: fase 1 e fondazioni Journal. Eseguire su un progetto Supabase nuovo.
-- Le membership sono assegnate dall’amministratore nel SQL Editor, mai dal browser.
begin;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (workspace_id, user_id)
);
create index workspace_members_user on public.workspace_members(user_id);

create function public.is_workspace_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members where workspace_id = target and user_id = (select auth.uid()));
$$;
revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);
create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 5000),
  category text not null check (category in ('Food','Experience','Walks','Nature','Culture','Travel','Shopping','Nightlife','Other')),
  status text not null check (status in ('TO_DO','DONE')),
  priority text check (priority in ('LOW','MEDIUM','HIGH')),
  address text not null check (char_length(trim(address)) between 1 and 500),
  latitude double precision not null check (latitude between -85.051129 and 85.051129),
  longitude double precision not null check (longitude between -180 and 180),
  location_source text not null default 'map' check (location_source in ('map', 'search')),
  estimated_cost numeric check (estimated_cost >= 0),
  price_band text check (price_band in ('LOW','MEDIUM','HIGH')),
  primary_image_path text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'TO_DO' and priority is not null) or (status = 'DONE' and priority is null)),
  check (primary_image_path is null or split_part(primary_image_path, '/', 1) = workspace_id::text),
  unique (id, workspace_id)
);
create index experiences_filters on public.experiences(workspace_id, status, category, priority);
create index experiences_updated on public.experiences(workspace_id, updated_at desc);
create index experiences_coordinates on public.experiences(workspace_id, latitude, longitude);

create function public.protect_experience_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.workspace_id <> old.workspace_id or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'Identità e autore dell’esperienza non sono modificabili';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger experiences_identity before update on public.experiences for each row execute function public.protect_experience_identity();

-- Le visite e le recensioni sono separate dallo stato del luogo e non si cancellano tornando a TO_DO.
-- UI e flussi transazionali Journal da realizzare nella fase 2.
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null,
  workspace_id uuid not null,
  visited_at date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (experience_id, workspace_id) references public.experiences(id, workspace_id),
  unique (id, experience_id, workspace_id)
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null,
  workspace_id uuid not null,
  visit_id uuid,
  author_id uuid not null default auth.uid() references auth.users(id),
  rating numeric check (rating between 0 and 5 and mod(rating * 2, 1) = 0),
  notes text not null default '' check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (experience_id, workspace_id) references public.experiences(id, workspace_id),
  foreign key (visit_id, experience_id, workspace_id) references public.visits(id, experience_id, workspace_id)
);
create index reviews_experience_author on public.reviews(experience_id, author_id);
create index visits_experience_date on public.visits(experience_id, visited_at desc);
create function public.protect_review_identity() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.author_id <> old.author_id or new.workspace_id <> old.workspace_id or new.experience_id <> old.experience_id or new.visit_id is distinct from old.visit_id or new.created_at <> old.created_at then
    raise exception 'Identità e autore della recensione non sono modificabili';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger reviews_identity before update on public.reviews for each row execute function public.protect_review_identity();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.profiles enable row level security;
alter table public.experiences enable row level security;
alter table public.visits enable row level security;
alter table public.reviews enable row level security;
create policy workspace_read on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy membership_read on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy profile_read on public.profiles for select to authenticated using (id = (select auth.uid()) or exists (select 1 from public.workspace_members own join public.workspace_members other on own.workspace_id = other.workspace_id where own.user_id = (select auth.uid()) and other.user_id = profiles.id));
create policy profile_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profile_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy experience_read on public.experiences for select to authenticated using (public.is_workspace_member(workspace_id));
create policy experience_insert on public.experiences for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
create policy experience_update on public.experiences for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy visit_read on public.visits for select to authenticated using (public.is_workspace_member(workspace_id));
create policy visit_insert on public.visits for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
create policy review_read on public.reviews for select to authenticated using (public.is_workspace_member(workspace_id));
create policy review_insert on public.reviews for insert to authenticated with check (public.is_workspace_member(workspace_id) and author_id = (select auth.uid()));
create policy review_update on public.reviews for update to authenticated using (public.is_workspace_member(workspace_id) and author_id = (select auth.uid())) with check (public.is_workspace_member(workspace_id) and author_id = (select auth.uid()));

-- Revoca esplicita: nessuna creazione di spazi/membership, cancellazione o scrittura anon-key dal frontend.
revoke all on public.workspaces, public.workspace_members, public.profiles, public.experiences, public.visits, public.reviews from anon, authenticated;
grant select on public.workspaces, public.workspace_members to authenticated;
grant select, insert, update on public.profiles, public.experiences, public.reviews to authenticated;
grant select, insert on public.visits to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('experience-images', 'experience-images', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;
create function public.can_read_experience_image(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members where workspace_id::text = split_part(path, '/', 1) and user_id = (select auth.uid()));
$$;
revoke all on function public.can_read_experience_image(text) from public;
grant execute on function public.can_read_experience_image(text) to authenticated;
create policy atlas_image_read on storage.objects for select to authenticated using (bucket_id = 'experience-images' and public.can_read_experience_image(name));
create policy atlas_image_insert on storage.objects for insert to authenticated with check (bucket_id = 'experience-images' and public.can_read_experience_image(name) and (storage.foldername(name))[2] = (select auth.uid())::text);
create policy atlas_image_delete on storage.objects for delete to authenticated using (bucket_id = 'experience-images' and public.can_read_experience_image(name) and (storage.foldername(name))[2] = (select auth.uid())::text);
commit;
