# ATLAS — Account, mappe personali e condivise

React + Vite + TypeScript, MapLibre e design light crema/corallo/lavanda/menta conservati. Accesso obbligatorio tramite Supabase email/password. Supabase è stato configurato dall’utente, che ha confermato operativi registrazione, login, mappe condivise e fotografie. Questa integrazione non modifica tali flussi. I dati IndexedDB precedenti sono conservati; importazione soltanto dopo accesso e consenso.

## Avvio locale

```sh
cd /Users/marketing3/Desktop/ATLAS
./npm-local.sh run dev
```

Apri [ATLAS](http://127.0.0.1:5173/). Se mancano le variabili Supabase vedrai le schermate account con avviso e invio disabilitato. Non c’è una modalità di login fittizio. Node 24/npm sono nella copia locale `.tools/node`; su altro computer usa Node 24 e `npm ci`.

```sh
./npm-local.sh run typecheck
./npm-local.sh test
./npm-local.sh run build
./npm-local.sh run preview -- --port 4173 --strictPort
```

## Attivazione, installazione e deployment

La [guida multiutente](docs/multiutente.md) contiene file creati, schema, regole privacy, impostazioni Auth/password/redirect, import locale, istruzioni iOS/Android e pubblicazione manuale su GitHub Pages.

Ordine esatto e script opzionali: [guida SQL](docs/ordine-sql-supabase.md).

SQL autonomo: [202610260001_multiuser.sql](supabase/migrations/202610260001_multiuser.sql). Usa tabelle `atlas_*`, senza eliminare i vecchi schemi. Applicalo prima di registrare utenti. Non attivare policy permissive. Non servono nuove Edge Functions per account/condivisione.

Variabili frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; mai service_role o segreti. Non serve più un workspace ID fisso. Nessun account o deploy creato automaticamente.

PWA standalone, icone originali ATLAS, istruzioni nelle schermate account/impostazioni. iPhone: Safari → Condividi → Aggiungi alla schermata Home. Android: Chrome → menu → Installa app (prompt nativo quando disponibile). Serve HTTPS su un sito raggiungibile dal telefono. Installazione non equivale a funzionamento offline.

## Verifiche

[Registro e matrice dei test](docs/verifica-multiutente.md): test locali su dominio/IndexedDB, validatori e PostgreSQL/RLS; verifiche ancora necessarie su Supabase reale e telefoni fisici. La documentazione della versione precedente è conservata in [README storico locale](docs/README-locale-storico.md).

Autocomplete e routing in auto sono integrati con Geoapify: configura `VITE_GEOAPIFY_API_KEY` come descritto nella [guida Geoapify](docs/geoapify.md). Nessuna migrazione SQL necessaria. Senza chiave vengono mostrati messaggi espliciti. OpenAI e meteo rimangono separati e non simulati.

## Design system

Token in `src/design/tokens.json`, CSS generato con `npm run theme`, icone con `scripts/generate-icons.py`. DM Sans è incluso localmente. Il redesign luminoso precedente è conservato.

## Costi facoltativi e spesa indicativa

Campo Costo in creazione/modifica e scheda, filtro prezzi nei Salvati/Mappa, carburante automatico e HERE soltanto per pedaggi coerenti con Geoapify. Nessuna configurazione auto. Vedi [istruzioni e migrazione manuale](docs/trip-costs-here.md).

## Preparazione GitHub Pages

[Guida aggiornata alla pubblicazione manuale](docs/github-pages.md): base path automatico dal repository, variabili Actions, audit dei file pubblicabili e URL Supabase/Geoapify da autorizzare. Nessun repository o sito pubblicato automaticamente durante la preparazione locale.
