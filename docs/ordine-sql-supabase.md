# ATLAS — Ordine esatto degli script Supabase

Revisione del 26 ottobre 2026. Verifica esclusivamente locale: nessuna migrazione o modifica eseguita sul database remoto.

## 1. Prima installazione del database attuale

Nel SQL Editor Supabase, eseguire **interamente e una sola volta**:

`/Users/marketing3/Desktop/ATLAS/supabase/migrations/202610260001_multiuser.sql`

È autonomo. Crea tutte le tabelle usate dal frontend: `atlas_profiles`, `atlas_maps`, `atlas_map_members`, `atlas_connection_requests`, `atlas_connections`, `atlas_categories`, `atlas_experiences`, `atlas_visits`, `atlas_reviews`, `atlas_trips`, `atlas_imports`; inoltre la tabella privata per rate limiting.

Comprende tutte le 9 RPC chiamate dal client, il trigger `atlas_signup` che crea profilo/mappa personale/membership/categorie per i nuovi account, FK anche composite, vincoli, protezione di ID e autori, RLS e permessi, bucket privati e policy Storage. L’accettazione della richiesta crea relazione e mappa condivisa in una transazione con vincoli contro duplicazioni.

La revisione ha aggiunto un arresto preventivo se esiste già un bucket ATLAS pubblico: evita di riutilizzarlo come se fosse privato. In quel caso la transazione viene annullata; verificare il bucket prima di riprovare, senza cancellarne gli oggetti. Rafforzata anche la revoca dei privilegi delle tabelle al ruolo PUBLIC.

**Non eseguire prima i due script storici** `202610230001_initial.sql` e `202610230002_categories_trips.sql`: implementano il vecchio modello `workspaces/experiences` senza prefisso, che il frontend attuale non usa. Se già applicati, il nuovo schema può convivere con essi, senza importarli o cancellarli. La seconda migrazione storica richiede la prima, ma entrambe sono superflue per l’installazione manuale attuale. Evitare un `db push` indiscriminato dell’intera cartella se si vuole installare solo lo schema corrente.

Il file non è idempotente: se `atlas_*` esiste già o compare “relation already exists”, non cancellare tabelle e non rieseguire pezzi dello script. Controllare prima lo stato con il file di verifica e conservare il backup.

## 2. Account Auth creati prima della migrazione: solo se presenti

Dopo il punto 1, facoltativamente:

`/Users/marketing3/Desktop/ATLAS/supabase/optional/backfill_existing_user.sql`

Il trigger non è retroattivo. Per un account preesistente privo di profilo/mappa, compilare i tre valori NULL: UUID reale da Authentication → Users, username scelto e nome visualizzato. Non usare email/password/chiavi. Il file incompleto si arresta senza scrivere. Crea solo quanto manca per quell’account, senza sovrascrivere il profilo o importare dati. Ripetibile con gli stessi valori. Usarlo solo nel SQL Editor amministrativo per l’account esplicitamente identificato.

Per nuovi account registrati dall’app dopo lo schema non serve alcun backfill. Non registrare utenti dalla dashboard senza i metadati obbligatori: l’app invia `display_name` e `username` durante `signUp`.

## 3. Controllo successivo: facoltativo, sola lettura

Dopo il punto 1 (e l’eventuale punto 2):

`/Users/marketing3/Desktop/ATLAS/supabase/checks/verify_multiuser.sql`

Sono solo SELECT su cataloghi e configurazione Storage, senza leggere luoghi, email o recensioni. Restituisce 61 controlli di esistenza/RLS/permessi/RPC/trigger/FK/Storage; tutte le righe devono avere `ok=true`. Non sostituisce i test remoti con utenti distinti e JWT reali, né verifica policy estranee al progetto eventualmente già presenti nel database.

## Operazioni distruttive

- Nessun DROP TABLE, TRUNCATE o cancellazione di dati viene eseguito durante l’installazione multiutente.
- La migrazione modifica permessi/RLS, aggiunge oggetti, bucket privati e, se presente, la publication Realtime.
- Definisce funzioni che, **solo quando successivamente invocate dall’app**, possono eliminare una categoria dopo riassegnazione o rimuovere la membership dell’utente che abbandona la mappa. Recensioni proprie e itinerari sono cancellabili attraverso le policy autorizzate; esperienze eliminate logicamente.
- Alcune FK hanno ON DELETE CASCADE per profili/membership in caso di futura cancellazione amministrativa del relativo utente o mappa: lo script non esegue tali cancellazioni.
- Il backfill aggiunge record, senza cancellare dati. Il controllo non scrive nulla.
- Gli script storici non sono necessari: il secondo contiene anche modifiche/rimozione di vincoli del vecchio schema; non usarli come soluzione al PGRST205 attuale.

## Impostazioni Auth da completare manualmente

- Email + Password abilitati; Anonymous Sign-ins disabilitato.
- Conferma email e SMTP/recapito email verificati.
- Password server: minimo 8 caratteri e policy minuscole/maiuscole/numeri/simboli, coerente con i cinque requisiti mostrati dall’app. Non basta la validazione frontend.
- Site URL e allowlist Redirect URLs: ambiente locale `http://127.0.0.1:5173/` e callback `http://127.0.0.1:5173/?recovery=1`; aggiungere gli equivalenti del dominio HTTPS pubblico con il suo base path quando disponibile.
- Schema API `public` esposto; schema `atlas_private` NON esposto. Conservare RLS, senza aggiungere policy globali permissive.
- Variabili già predisposte nel frontend: URL progetto e publishable key. Nessuna service_role nel client.

Se dopo l’installazione completa e i controlli PGRST205 persiste, verificare che l’API punti allo stesso progetto, che `public` sia esposto e che PostgREST abbia aggiornato la cache dello schema. Nessun reset della cache o modifica remota è stato eseguito automaticamente da questa revisione.
