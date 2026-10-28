-- FACOLTATIVO. Solo per un account Auth creato PRIMA della migrazione multiutente.
-- Eseguire DOPO 202610260001_multiuser.sql dal SQL Editor amministrativo.
-- Compilare esplicitamente i TRE valori NULL sotto, usando l'UUID reale da Authentication > Users.
-- Non inserire email, password o chiavi. Non viene modificato auth.users.
-- Con i valori NULL questo script si ferma, senza scrivere alcun dato.
-- Crea solo il profilo mancante, la mappa personale mancante e la sua membership.
-- Nessuna importazione di dati locali, nessun collegamento ad altri utenti.
begin;
do $$
declare
 target_user uuid := NULL;
 chosen_username text := NULL;
 chosen_display_name text := NULL;
 mid uuid;
 existing_username text;
 new_map boolean := false;
begin
 if target_user is null or chosen_username is null or chosen_display_name is null then
   raise exception 'Compila target_user, chosen_username e chosen_display_name prima di eseguire il backfill';
 end if;
 chosen_username:=lower(trim(chosen_username));
 chosen_display_name:=trim(chosen_display_name);
 if chosen_username !~ '^[a-z0-9_]{3,20}$' or length(chosen_display_name) not between 1 and 80 then
   raise exception 'Username o nome visualizzato non valido';
 end if;
 perform 1 from auth.users where id=target_user and not coalesce(is_anonymous,false) for update;
 if not found then raise exception 'Account Auth non trovato oppure anonimo';end if;
 select username into existing_username from public.atlas_profiles where id=target_user;
 if existing_username is not null and existing_username<>chosen_username then
   raise exception 'Questo account ha già uno username diverso: nessun dato sovrascritto';
 end if;
 insert into public.atlas_profiles(id,display_name,username)
 values(target_user,chosen_display_name,chosen_username) on conflict(id) do nothing;
 select id into mid from public.atlas_maps where created_by=target_user and type='personal';
 if mid is null then
   insert into public.atlas_maps(name,type,created_by) values('La mia mappa','personal',target_user) returning id into mid;
   new_map:=true;
 end if;
 insert into public.atlas_map_members(map_id,user_id,role) values(mid,target_user,'owner') on conflict(map_id,user_id) do nothing;
 if new_map then perform atlas_private.seed_categories(mid);end if;
end;$$;
commit;
