-- SOLO LETTURA, facoltativo, da eseguire manualmente nel SQL Editor Supabase.
-- Sostituire NULL con l'UUID del PROPRIO account da Authentication > Users, tra apici e con ::uuid.
-- Nessuna email, password, token o chiave. Non mostra contenuto di esperienze, recensioni o foto.
-- Il SQL Editor amministrativo non usa il JWT del browser: questi conteggi NON sono un test RLS.
with input(user_id) as (values(NULL::uuid)),
personal as (
 select m.id from public.atlas_maps m join input i on i.user_id=m.created_by where m.type='personal'
)
select
 case when i.user_id is null then 'Inserire prima il proprio UUID nella CTE input' else 'Conteggi remoti per l’account selezionato' end as verifica,
 exists(select 1 from public.atlas_profiles p where p.id=i.user_id) as profilo_remoto_presente,
 (select count(*) from personal) as mappe_personali,
 (select count(*) from public.atlas_map_members mm join personal p on p.id=mm.map_id where mm.user_id=i.user_id and mm.role='owner') as membership_proprietario,
 (select count(*) from public.atlas_map_members mm join personal p on p.id=mm.map_id where mm.user_id<>i.user_id) as altri_membri_nella_personale,
 (select count(*) from public.atlas_experiences e join personal p on p.id=e.map_id where e.deleted_at is null) as esperienze_attive,
 (select count(*) from public.atlas_categories c join personal p on p.id=c.map_id) as categorie,
 (select count(*) from public.atlas_visits v join personal p on p.id=v.map_id where v.user_id=i.user_id) as visite_proprie,
 (select count(*) from public.atlas_reviews r join personal p on p.id=r.map_id where r.author_id=i.user_id) as recensioni_proprie,
 (select count(*) from public.atlas_trips t join personal p on p.id=t.map_id) as viaggi_salvati,
 (select count(*) from public.atlas_experiences e join personal p on p.id=e.map_id where e.deleted_at is null and e.image_path is not null) as esperienze_con_foto_storage,
 (select count(*) from public.atlas_connection_requests r where r.sender_id=i.user_id or r.recipient_id=i.user_id) as richieste_connessione,
 (select count(*) from public.atlas_maps m join public.atlas_map_members mm on mm.map_id=m.id where mm.user_id=i.user_id and m.type='shared') as mappe_condivise
from input i;

-- Controllo metadati dei bucket, senza leggere immagini o link firmati.
select expected.id as bucket,
 exists(select 1 from storage.buckets b where b.id=expected.id) as presente,
 exists(select 1 from storage.buckets b where b.id=expected.id and b.public=false) as privato
from (values('atlas-images'),('atlas-avatars')) expected(id);
