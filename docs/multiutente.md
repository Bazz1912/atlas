# ATLAS — Account, mappe e PWA

Aggiornamento del 26 ottobre 2026. Il design light esistente e i componenti di mappa, recensioni, categorie, Explorer e Viaggi sono conservati. L’uso dell’app ora richiede un account email/password: senza configurazione Supabase l’accesso è disabilitato con messaggio esplicito, senza login simulato e senza caricare l’archivio locale nella mappa.

## File e architettura

- `src/account/AccountGate.tsx`: sessione, profilo, mappe accessibili, selettore, cambio mappa con smontaggio dello stato precedente.
- `AuthScreen.tsx`, `validation.ts`: registrazione, accesso, recupero e nuova password; requisiti live e conferma.
- `AccountPanel.tsx`: profilo/avatar, password, logout, ricerca username, richieste, membri, rinomina e uscita da mappe condivise.
- `cloudArchive.ts`: adapter delle funzioni preesistenti per esperienze, categorie, recensioni, visite e viaggi, sempre nella mappa selezionata.
- `scope.ts`: blocca accessi privati senza contesto e risultati asincroni riferiti a una mappa/sessione diversa. Nessun fallback locale nell’app autenticata.
- `LegacyImport.tsx`: consenso, destinazione esplicita, foto, ID deterministici, import atomico e verifica successiva; originali conservati.
- `ReviewEditor.tsx`: modifica/eliminazione delle sole recensioni proprie; autori e avatar dal profilo autenticato. Media mostrata da due voti in su.
- `InstallAtlas.tsx`, `PwaLifecycle.tsx`: istruzioni, prompt Android solo quando disponibile, offline e aggiornamento PWA.
- `account.css`: interfacce crema/corallo, focus, touch target, scroll e safe area.
- `security.test.ts`: test SQL con PostgreSQL in WebAssembly (PGlite, solo dipendenza di sviluppo); Auth e Storage sono strutture di test locali, NON un servizio Supabase simulato nell’app.
- `validation.test.ts`: password, username, invalidazione del contesto.
- `supabase/migrations/202610260001_multiuser.sql`: schema, indici, vincoli, RLS, RPC atomiche, Storage e trigger onboarding.

I repository locali e IndexedDB `atlas-v2` rimangono disponibili per test, backup e import esplicito; non vengono cancellati. I nuovi dati cloud non vengono scritti nell’IndexedDB globale. Bozza viaggio e Casa rimangono in memoria nella sessione della mappa: salva il viaggio per ritrovarlo, il cambio mappa azzera la bozza non salvata.

Per l’ordine manuale aggiornato, i controlli e gli account preesistenti vedere [ordine SQL](ordine-sql-supabase.md).

## Configurazione Supabase da completare

1. Crea un progetto Supabase di staging e conserva il backup di qualunque database precedente. Nessun account o progetto è stato creato da questo aggiornamento.
2. Per il nuovo sistema esegui **`supabase/migrations/202610260001_multiuser.sql`** nel SQL Editor. È autonomo e usa tabelle `atlas_*`; non richiede le due migrazioni storiche e può convivere con esse. Se usi la CLI sulle migrazioni dell’intero repository, le prime due rimangono storiche e vengono applicate prima. Non rieseguire la stessa migrazione SQL manualmente. Non elimina né importa le vecchie tabelle `profiles/workspaces/experiences`.
3. Il trigger su `auth.users` richiede `display_name` e `username`: crea gli account dall’app dopo aver applicato lo schema. Account Supabase già esistenti richiedono backfill amministrativo verificato (non attribuire loro dati locali automaticamente). Disabilita Anonymous Sign-ins.
4. In Authentication abilita Email + Password e **Confirm email**. Configura SMTP reale per recapito affidabile e controlla i limiti email.
5. Password: minimo **8**; **Required characters = lowercase, uppercase, digits and symbols** (`lower_upper_letters_digits_symbols` nella configurazione CLI). Questa policy server è più forte del minimo richiesto: aggiunge minuscola e numero. Il frontend mostra gli stessi cinque requisiti. La sola validazione React non è sufficiente: impostare questa policy prima di aprire le registrazioni. Il Password Verification Hook non è un validatore della nuova password e non viene usato per questo scopo.
6. Configura Site URL al dominio HTTPS finale con base, per esempio `https://NOME.github.io/atlas/`. Allowlist Redirect URLs con `http://127.0.0.1:5173/`, `http://127.0.0.1:5173/?recovery=1` e gli equivalenti pubblici `.../atlas/` e `.../atlas/?recovery=1`. Aggiungi localhost soltanto se effettivamente usato. Le email passano dalla pagina unica dell’app, compatibile con Pages e PKCE: nessuna route server `/reset-password` necessaria. Il browser che apre il link deve conservare il verifier PKCE; se manca richiedi un nuovo link dallo stesso browser.
7. Copia `.env.example` in `.env.local` e imposta solo `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Riavvia Vite. Non serve più `VITE_WORKSPACE_ID`. Non usare service_role, secret key o password DB nel frontend. Il client Supabase conserva i token della sessione tramite SDK; non conserva password.
8. In API lascia `public` esposto, **non esporre `atlas_private`**. Le funzioni pubbliche sono wrapper invoker; le operazioni privilegiate interne verificano identità/membership e fissano search_path. Non aggiungere policy permissive per aggirare errori.
9. Controlla i bucket privati `atlas-images` (8 MB) e `atlas-avatars` (2 MB). Foto: percorso `mapId/userId/file`; avatar: `userId/file`. Upload nuovo, nessun overwrite. URL firmati 15 minuti, cache-control 0 sugli upload, nessuna cache runtime del service worker su API/immagini private. Gli URL già emessi scadono a fine TTL, non istantaneamente al logout. Oggetti orfani dopo errori o sostituzioni vanno eliminati con una procedura amministrativa separata.
10. Realtime: la migrazione aggiunge le tabelle alla publication `supabase_realtime` se esiste. Il client sottoscrive richieste, membership e dati della mappa sotto RLS. In ogni caso refresh ogni 30 secondi quando visibile, al focus/ritorno online e comandi manuali. Le cancellazioni possono richiedere il polling. Non sono notifiche push.
11. Ricerca: minimo 3 caratteri, prefisso case-insensitive, debounce 400 ms, 10 risultati, massimo 20 query riuscite/minuto per account. Richieste: 5/minuto, un tentativo per coppia ogni 24 ore e vincolo per pending duplicati anche inversi. Per contrastare abuso con molti account servono anche rate limit Auth, conferma email e controlli operativi del progetto; non si promette immunità allo scraping.

Non servono nuove Edge Functions per questi flussi: le transazioni sensibili sono RPC PostgreSQL. Geoapify, routing, meteo e OpenAI rimangono da configurare come prima.

Fonti ufficiali consultate: [Password security](https://supabase.com/docs/guides/auth/password-security), [Password-based Auth](https://supabase.com/docs/guides/auth/passwords), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Regole dei dati

- Profili pubblici ai membri pertinenti e alle controparti di richieste; ricerca controllata tramite RPC. Nessuna email nelle tabelle profilo o nei risultati.
- Unica mappa personale creata nel trigger di registrazione, vuota salvo le categorie italiane iniziali. Le esperienze appartengono a `map_id`, non al solo autore.
- Accettazione: blocco della richiesta e della coppia, relazione unica, mappa condivisa inizialmente vuota e due membri, tutto atomico. Rifiuto/annullamento non creano mappe.
- Tutti i membri possono modificare esperienze, categorie e viaggi; recensioni/visite sono modificabili solo dal loro autore autenticato. Nessun client può inserire o cambiare membership/proprietà direttamente.
- Eliminazione esperienza logica, confermata e applicata anche agli altri membri; foto e storico rimangono conservati. Recupero esperienza a cura dell’amministratore, non presente nell’interfaccia.
- Uscita da mappa condivisa confermata; l’eventuale proprietà passa al membro restante. Se nessuno resta, dati conservati senza accesso client. Non tocca la mappa personale. La relazione storica della coppia rimane: rientro o nuovi inviti alla stessa coppia dopo uscita richiedono una futura gestione amministrativa; non viene creata una mappa duplicata.
- Nessuna fusione automatica. Copia/spostamento ordinario tra mappe non introdotti in questa versione; l’import legacy è un’azione separata, esplicita e consensuale.
- Explorer riceve solo esperienze/recensioni della mappa; il filtro sul voto personale usa l’UID autenticato. Viaggi e categorie condividono lo stesso contesto. Routing, meteo e AI esterna non sono inventati.

Lo schema usa colonne relazionali per identità, appartenenza e riferimenti; i dati dei componenti preesistenti sono conservati nel campo JSONB `data` di esperienze e viaggi con vincoli/trigger di validazione. Le chiavi esterne composite impediscono categorie, visite e tappe in mappe estranee. Non si tratta di un unico documento modificabile che bypassa RLS.

## Import dell’archivio locale

Dopo accesso: Impostazioni → Profilo/Amici/Mappe → Mappe → seleziona destinazione → “Importa i tuoi luoghi”. Conferma che l’archivio è tuo e che puoi condividerlo con i membri della destinazione. Una sola importazione per coppia account/archivio, indipendentemente dalla destinazione. ID rimappati per non sovrascrivere luoghi esistenti. Categorie copiate con suffisso “locale”. Solo le recensioni dell’identità locale esplicitamente rivendicata vengono attribuite al nuovo account. Foto data URL caricate nel bucket privato. Tappe con esperienze eliminate escluse insieme al viaggio incompleto; niente collegamenti silenziosi a mappe altrui.

Massimo 1000 esperienze per import atomico; errori SQL annullano l’intera transazione. Upload foto precedono la transazione: retry usa gli stessi percorsi, oggetti privati possono restare orfani dopo un errore. Verifica finale degli ID inseriti a blocchi; gli originali **non vengono mai eliminati**, neppure dopo successo. Foto non locali generano un errore esplicito. Per altri archivi o quantità maggiori predisporre un import amministrativo dopo backup.

## Installazione PWA

- **iPhone:** apri URL HTTPS in Safari → Condividi → Aggiungi alla schermata Home → Aggiungi. Non esiste un pulsante automatico simulato.
- **Android:** Chrome → menu ⋮ → Installa app / Aggiungi a schermata Home. In impostazioni compare il prompt nativo solo dopo `beforeinstallprompt`.
- Icone ATLAS originali locali da 192/512 px, maskable e Apple Touch; manifest standalone e colori crema. Splash generata dal sistema dove supportato, senza promettere splash personalizzata identica su ogni versione iOS.
- Installazione non significa funzionamento offline. Shell e font nel precache; niente caching di dati Auth, database o foto private. Offline viene segnalato, salvataggio/login richiedono rete. Il browser segnala la connettività ma non certifica disponibilità del server.
- In sviluppo il service worker è disattivato. Per provarlo: `./npm-local.sh run build`, poi `./npm-local.sh run preview -- --port 4173 --strictPort`. Il localhost del Mac non è il localhost del telefono: per installare da telefono usare un sito HTTPS raggiungibile.

## Pubblicazione GitHub Pages (da fare manualmente)

Nessun account GitHub collegato o modificato e nessun push effettuato.

1. Configura e collauda Supabase di staging, quindi prepara le impostazioni di produzione.
2. Nel tuo repository imposta Pages → Source: GitHub Actions. Il workflow `.github/workflows/pages.yml` è già predisposto con Node 24, test, build e deploy Pages.
3. Repository Variables pubbliche: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; facoltativa `VITE_GEOAPIFY_API_KEY`. Nessuna service_role o chiave OpenAI. `VITE_BASE_PATH` è derivata dal nome repository nel workflow (root per `*.github.io`, `/<repository>/` altrimenti).
4. Prima di push/deploy: `npm ci`, `npm run typecheck`, `npm test`, `VITE_BASE_PATH=/atlas/ npm run build` (sostituisci `atlas`). Non servono SPA rewrite: l’app usa la stessa pagina per i callback Auth.
5. Quando decidi di pubblicare, esegui tu push o workflow. Attendi Pages, verifica HTTPS, inserisci gli URL esatti nella allowlist Supabase e prova registrazione/email/reset dal dominio pubblico e sul telefono.
6. Pages ospita solo la PWA; Supabase ospita identità e dati. Le quote gratuite dei servizi restano quelle del tuo account, da verificare prima dell’utilizzo.
