# Verifica account, condivisione e PWA — 26 ottobre 2026

## Eseguito in locale

- Typecheck TypeScript e build Vite/PWA.
- 40 test in 6 file. 24 test preesistenti conservati, 4 nuovi su username/password/cambio contesto, 12 nuovi con motore PostgreSQL PGlite.
- Migrazione multiutente eseguita realmente in PostgreSQL locale con strutture Auth/Storage isolate di test, ruoli anon/authenticated e UID test. Nessun account test o dato fixture introdotto nell’app o in Supabase remoto.
- SQL: onboarding personale vuoto; vincolo username e rollback; RPC ricerca senza email e blocco anon; invio e duplicazioni; accettazione solo dal destinatario e singola mappa condivisa; lettura dei due membri ed esclusione del terzo; divieto di cambio map_id e membership arbitrarie; recensioni per autore (modifica/cancellazione altrui negate); voto 4,2 rifiutato; tappe cross-map negate via RPC e insert REST equivalente; policy Storage di lettura/upload; import idempotente/rollback; uscita e revoca accesso condiviso senza toccare personale.
- Ispezione browser a 390 × 844: accesso, registrazione, requisiti password che cambiano in tempo reale con input di prova, recupero e istruzioni installazione; Supabase mancante indicato, nessuna registrazione fittizia. Dati precedenti non cancellati.

## Matrice richiesta: stato e test reali da completare

| # | Flusso | Verifica locale | Da verificare su Supabase/dispositivo |
|---|---|---|---|
| 1 | Registrazione | Input, trigger onboarding SQL | Auth API, SMTP, conferma email |
| 2 | Password invalida | Validatore e requisiti live | Policy Auth sulle chiamate API dirette |
| 3 | Username duplicato | Unique DB e rollback | Due registrazioni Auth simultanee |
| 4 | Login | Schermata, client collegato alle API SDK | Account reale e credenziali errate |
| 5 | Logout | Gestione sessione, stato smontato, nessun fallback legacy | Token refresh, logout multi-tab |
| 6 | Recupero | Schermata e flusso PKCE predisposto | Email reale e updateUser dal callback |
| 7 | Mappa vuota | Trigger SQL | Primo accesso browser con account reale |
| 8 | Esperienza personale | Test locali precedenti + SQL con map_id | Upload foto remoto e signed URL |
| 9 | Ricerca utenti | RPC, limiti input, nessuna email | UI con account reali e antiabuso operativo |
| 10 | Invio richiesta | SQL, auto-invio/duplicati respinti | Due browser online |
| 11 | Accettazione | SQL autorizzazioni e transazione | UI del destinatario |
| 12 | Mappa condivisa | SQL creazione atomica vuota | Arrivo nel selettore reale |
| 13 | Due account | Ruoli PostgreSQL distinti | Due sessioni browser/dispositivi |
| 14 | Sincronizzazione | Adapter e subscription predisposti, polling fallback | Publication, WebSocket, perdita rete |
| 15 | Recensioni individuali | SQL ownership e rating | Avatar/autori e modifiche UI end-to-end |
| 16 | Isolamento mappe | RLS/FK, validazione tappe e cambio contesto | Navigazione rapida con richieste in volo |
| 17 | Accesso non autorizzato | SQL negativo su mappe/reviews/membri/Storage | REST/Storage reali con JWT di terzo e anon |
| 18 | Import locale | SQL una sola volta, rollback, vecchi test IndexedDB | Foto, retry e verifica completa su bucket reale |
| 19 | Installazione | Manifest/icona/SW, istruzioni e supporto eventi | Safari iOS e Chrome Android fisici |
| 20 | Pages | Build con base, percorsi manifest e callback | Deploy HTTPS non effettuato |

I test locali PostgreSQL NON collaudano Supabase Auth, i suoi token, SMTP, HTTP Storage, Realtime o la configurazione operativa. Queste verifiche richiedono il progetto che l’utente deve ancora configurare. Non dichiarati funzionanti login/registrazione/condivisione remoti prima di tale collaudo. Le funzioni applicative dietro login non sono state sbloccate con autenticazione simulata per fare screenshot.

## Limiti espliciti

- Nessun deploy, account GitHub collegato, servizio esterno attivato o segreto aggiunto.
- Nessun test su hardware iPhone/Android, tastiera virtuale o installazione fisica.
- Nessuna promessa di dati/mappe disponibili offline. Il service worker precache solo asset statici; API/foto private escluse.
- Bozza viaggio e Casa restano in memoria della sessione; viaggio salvato persistito nel cloud. Cambio mappa azzera bozza non salvata.
- Uscita da condivisione non elimina i dati ma richiede intervento amministrativo per un eventuale rientro della stessa coppia. Copia/spostamento normale tra mappe non introdotti.
