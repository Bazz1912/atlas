# AI Explorer: implementazione e attivazione

**Stato: codice e test locali pronti; deployment e collaudo remoto non ancora eseguiti.** Non considerare l’integrazione operativa sul progetto remoto finché i passaggi qui sotto non sono completati. Il secret OpenAI dichiarato dall’utente non è stato letto o copiato in locale. Nessuna chiamata OpenAI reale eseguita durante lo sviluppo; nessun costo API di test generato.

## File principali

- `supabase/functions/atlas-ai-explorer/index.ts`: ingresso Supabase, verifica sessione tramite `auth.getUser`, client con JWT utente e RLS per tutte le letture, verifica mappa/membership e query delle sole recensioni dell’utente verificato. Client amministrativo usato esclusivamente per i due RPC anti-abuso, mai per leggere esperienze/profili di altre mappe.
- `handler.ts`: CORS ad origini esplicite, input JSON massimo 16 KiB, validazioni, deduplica persistente, gestione errori e controllo finale di permessi/revisione dei dati prima della risposta.
- `engine.ts`: interpretazione, filtri deterministici, fino a tre combinazioni di massimo cinque nuove tappe, verifica ID/ordine/stati/recensioni, percorso, guida totale, soste e meteo. Possibile aggiunta al viaggio corrente: le tappe precedenti sono mantenute senza duplicati, incluse nei calcoli.
- `supabase/functions/_shared/openai.ts`: Responses API, Structured Outputs strict, `store:false`, timeout 30 secondi, contesto massimo 40.000 caratteri e massimo 1800 token di output. Nessun tool del modello, accesso web o esecuzione delle descrizioni. Al modello vengono forniti categorie, titoli, stato, ambiente e ultimo voto personale; non foto, recensioni testuali o coordinate della partenza. Il testo libero dell’utente può naturalmente contenere informazioni che l’utente decide di inviare.
- `supabase/functions/_shared/explorer-domain.ts`: parsing e verifica server di filtri e tappe. Filtri del modulo non allentati dall’interpretazione.
- `supabase/functions/_shared/atlas/`: implementazioni uniche di dominio, routing Geoapify, meteo Open-Meteo, soglie e calcolo arrivi; il frontend le riesporta dai percorsi precedenti `src/domain.ts` e `src/services/`. Sono incluse nel pacchetto Functions per evitare dipendenze di deployment esterne e duplicazioni delle integrazioni esistenti.
- `src/services/aiExplorer.ts`: invocazione autenticata tramite `supabase.functions.invoke`, scope della mappa controllato anche al ritorno, trasferimento del viaggio e delle previsioni temporanee alla cache browser.
- `src/components/Explorer.tsx`, `ExplorerProposals.tsx`: wizard esistente, richiesta libera, revisione dei filtri, foto reali già caricate, stato/voto personale, percorso e durata verificati, avvisi meteo e “Apri in Viaggi”. In `App.tsx` e `Trips.tsx`: ordine, soste, geometria e contesto del piano conservati.
- `supabase/config.toml`, `deno.json`, `deno.lock`, `tsconfig.edge.json`, `supabase-local.sh`, `package.json`/lock: configurazione e verifiche. `supabase-local.sh` conserva lo stato CLI nella cartella ignorata `.tools/supabase-home`, all’interno di ATLAS. Vite ne blocca l’accesso HTTP, insieme ai metadati `.supabase/`.

## 1. SQL: applicare solo la migrazione nuova

Dal SQL Editor del progetto Supabase corretto, eseguire **una volta**:

`supabase/migrations/202610260002_ai_explorer.sql`

Prerequisito: la migrazione multiutente `202610260001_multiuser.sql`, già applicata dall’utente. Non rieseguire quella migrazione né quelle storiche. Usare questo file separato nel SQL Editor: la cronologia delle migrazioni applicate manualmente potrebbe non coincidere con quella della CLI.

La nuova migrazione crea esclusivamente tabelle private per contatori/cache e due RPC eseguibili solo dal ruolo server `service_role`. RLS e privilegi impediscono al frontend di leggere, azzerare o falsificare i contatori e le risposte. Non modifica le policy esistenti, dati di esperienze, utenti, foto o viaggi; non contiene DROP/TRUNCATE. Contiene la pulizia automatica delle sole nuove righe temporanee della cache AI più vecchie di un giorno, al momento delle richieste. Senza migrazione la funzione si ferma prima di chiamare OpenAI.

Dopo l’applicazione si può eseguire `supabase/checks/verify_ai_explorer.sql`: quattro righe con `ok=true`, controllo in sola lettura e senza costi OpenAI.

## 2. Secret della Edge Function

In Supabase Dashboard → Edge Functions → Secrets:

| Secret | Configurazione |
| --- | --- |
| `OPENAI_API_KEY` | Già impostato dall’utente; lasciarlo sul server. |
| `OPENAI_MODEL` | Necessario. Esempio supportato: `gpt-4.1-mini`; scegliere un modello disponibile al proprio progetto e compatibile con Responses e Structured Outputs. |
| `GEOAPIFY_API_KEY` | Necessario per percorsi/combinazioni con almeno due punti. Usare una chiave per chiamate server: la chiave browser con restrizioni referrer può rifiutare richieste Edge. Conservare le restrizioni della chiave browser esistente; non falsificare il referrer. |
| `ATLAS_ALLOWED_ORIGINS` | Origini consentite separate da virgola, senza slash finale. Per locale: `http://127.0.0.1:5173,http://localhost:5173`. Aggiungere l’origine HTTPS effettiva per la futura pubblicazione. |

`SUPABASE_URL` e le chiavi standard di piattaforma sono fornite da Supabase. Il codice supporta `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` e le nuove chiavi nominate `SUPABASE_PUBLISHABLE_KEYS`/`SUPABASE_SECRET_KEYS` (con fallback singolare). Non creare secret con prefisso riservato `SUPABASE_`. Le chiavi amministrative rimangono nel runtime server, mai in Vite.

Nessuna nuova variabile `.env.local` frontend. Nessuna `VITE_OPENAI_API_KEY`. Il codice non richiede che si incolli una chiave in conversazione o nei comandi sottostanti. Configurare i valori sensibili dal Dashboard.

## 3. Comandi esatti di deployment sul Mac

La CLI ufficiale è già una dipendenza di sviluppo locale (versione verificata 2.122.0). Dal Terminale:

```sh
cd /Users/marketing3/Desktop/ATLAS
./supabase-local.sh login
./supabase-local.sh functions deploy atlas-ai-explorer --project-ref fuavwnjyjxqxbqsulugz --use-api
./supabase-local.sh functions list --project-ref fuavwnjyjxqxbqsulugz
```

Completare personalmente il login nel browser/Terminale; non incollare token nella chat. Non è necessario eseguire `supabase link`, `db push`, reset o migrazioni con la CLI per questo flusso. Il flag `--use-api` evita di richiedere Docker. Il comando distribuisce solo `atlas-ai-explorer`, senza eliminare altre funzioni.

**Mantenere `verify_jwt=true`**, già impostato in `supabase/config.toml`. Il client invia il JWT di sessione in `Authorization` e la Publishable Key in `apikey`; la funzione verifica comunque l’utente con Auth. Un errore 401 va risolto controllando sessione, progetto e configurazione, senza disabilitare JWT.

Il deployment non è stato eseguito: la verifica CLI in sola lettura ha restituito `AccessTokenRequiredError`. Manca una sessione CLI autenticata; inoltre questa attività non autorizza l’applicazione automatica della nuova migrazione remota.

## Protezioni e limiti

- 2 richieste/minuto e 20/giorno UTC per utente; 20/minuto e 200/giorno globali. Contatori SQL atomici, condivisi tra istanze, non modificabili dal client. Anche richieste senza risultati/errori possono consumare un tentativo; la cache delle richieste identiche evita nuovi costi modello.
- Deduplica per utente/mappa/input/revisione dati, chiave di idempotenza e cache privata di 2 minuti. Revoca membership o modifica dei dati impediscono il riuso di una risposta vecchia. Le proposte in UI scadono e richiedono nuova ricerca.
- Testo richiesta massimo 3000 caratteri, preferenze 1500, massimo 60 candidati dopo i filtri, massimo 300 righe da esaminare e 1000 recensioni personali. In caso di eccesso si richiede di restringere i filtri; nessun troncamento spacciato per ricerca completa.
- Una richiesta di interpretazione e una ricerca delle proposte sono due invocazioni distinte. Nessuna chiamata durante clic sui filtri o digitazione. Le selezioni guidate senza testo richiedono una sola chiamata modello.
- Timeout modello 30 secondi, elaborazione complessiva 90 secondi, client 110 secondi. Errori e quote diventano messaggi controllati; non vengono riportati errori grezzi con chiavi o richieste personali.
- Nessun automatismo che scriva esperienze/recensioni o salvi viaggi. “Apri in Viaggi” apre una bozza modificabile; “Salva viaggio” resta l’azione esistente nella mappa attiva.

## Comportamenti e limiti funzionali espliciti

La richiesta libera viene prima interpretata, poi mostrata per revisione. Con chiarimenti pendenti occorre riformulare la richiesta, oppure scegliere esplicitamente la ricerca con soli filtri guidati. Per “casa” va selezionato un punto reale in Partenza. Per “nelle vicinanze” serve un limite misurabile.

Ogni tappa può avere criteri diversi: ristorante già fatto con ultimo voto personale ≥4,5, seguito da un pub da fare. L’AI ordina soltanto ID reali; il server verifica nuovamente l’ammissibilità di ogni posizione. Titolo, descrizione e motivazione delle schede vengono composti dai dati e dai controlli effettivi, non da affermazioni numeriche del modello.

Il limite in auto riguarda la guida totale del percorso, con ritorno soltanto se selezionato, senza traffico live. Il tempo disponibile include tutte le soste pianificate. La sosta proposta iniziale di 30 minuti è visibile e modificabile, non è una misura dell’attività. Le durate esplicitamente richieste per singola tappa prevalgono. Senza partenza la guida per raggiungere una singola esperienza non è verificata e la durata totale resta non verificata; con un vincolo temporale obbligatorio si richiede la partenza.

Geoapify viene riutilizzato sul server; Open-Meteo usa gli arrivi quando verificabili, altrimenti giorno/orario pertinente con limite dichiarato. Le proposte sono ordinate favorendo compatibilità meteo; le tappe outdoor rischiose restano visibili e richiedono “Mantieni comunque” prima del trasferimento. Le attività indoor non vengono bloccate. Il meteo assente resta non verificato, mai bel tempo presunto.

Il budget usa ora i costi facoltativi salvati, partecipanti, carburante convenzionale automatico e pedaggi HERE compatibili quando disponibili. Prezzi mancanti non sono gratuiti e impediscono di garantire il budget complessivo. Geoapify resta il routing principale. Vedi la guida aggiornata [Costi semplici e pedaggi](trip-costs-here.md) per migrazione 003 e deployment dei due entrypoint. Aperture e prenotazioni non sono verificate.

Le proposte sono fino a tre, non necessariamente tre: combinazioni non percorribili o fuori dai limiti vengono scartate con spiegazione, senza ripieghi casuali. Se le combinazioni selezionate dal modello non risultano verificabili, non si afferma che non esista alcuna possibile combinazione nell’intero archivio: si chiede di modificare/ridurre la ricerca.

## Test locali e collaudo dopo deployment

Typecheck frontend + Edge, controllo nativo Deno, build PWA e suite Vitest completa. Test su autenticazione e negazione accessi, mappe personali altrui, input/CORS, ID inventati/duplicati/ordine errato, stati e rating personali, guida e tempo totale, meteo indisponibile, tre tappe, prefisso del viaggio, trasferimento a Viaggi/cache meteo, Structured Outputs, errori/quote OpenAI. SQL su PGlite **locale e isolato** per nuovi privilegi, contatori, idempotenza e cache; nessun test scrive sul progetto remoto.

Da verificare realmente dopo migrazione e deployment:

1. Aprire ATLAS in Chrome e accedere con il proprio account, nella mappa voluta.
2. Primo test contenuto: due esperienze salvate raggiungibili in auto, partenza reale, due tappe e soste esplicite. Usare **Trova un’idea** senza testo libero: una chiamata OpenAI, fino a tre percorsi verificati. Espandere il meteo, confermare eventuali rischi, **Apri in Viaggi** e controllare ordine, soste e percorso. Il salvataggio è facoltativo e usa il flusso Supabase esistente.
3. Dopo aver rispettato il limite di due richieste/minuto, aprire **Richiesta in linguaggio naturale**. Provare: “Domenica voglio pranzare e poi fare una passeggiata, massimo un’ora di macchina da casa”. Premere **Interpreta richiesta**, leggere eventuali chiarimenti e filtri; soltanto quando rappresentabili, **Conferma i filtri e cerca proposte**. Questo test usa due chiamate OpenAI fatturate secondo modello/token; le misure Geoapify usano la quota Geoapify. Non è incluso nel collaudo locale a costo zero.
4. Provare la combinazione già fatto ≥4,5 personale + pub da fare con dati realmente presenti. Il voto di altri membri non deve rendere ammissibile una tappa. Con dati insufficienti, nessun luogo inventato.
5. Verificare mappa non autorizzata e utente non autenticato con due sessioni reali controllate: 403/401, nessun dato altrui. Non servono password/token in chat.
6. Terza ricerca non identica entro un minuto: limite 429. Richiesta identica appena completata: risposta da cache, senza nuova chiamata modello. Cambiare luogo/stato/recensione invalida la cache.
7. Rete, quote/modello non disponibile, secret Geoapify assente/referrer errato e meteo fuori orizzonte: messaggi chiari, nessun dato sostitutivo.

Le prove 1–7 sul servizio remoto sono ancora pendenti. Non basta vedere il modulo frontend per dichiarare completata l’integrazione OpenAI.

## Fonti tecniche

- [OpenAI Structured Outputs / Responses](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- [Modello GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- [Supabase: authorization headers e JWT](https://supabase.com/docs/guides/functions/auth-headers)
- [Supabase: deployment Functions](https://supabase.com/docs/guides/functions/deploy)
- [Supabase: secret e variabili server](https://supabase.com/docs/guides/functions/secrets)

## Inventario dei file di questa integrazione

Nuovi:

- `supabase/config.toml`
- `supabase/migrations/202610260002_ai_explorer.sql`
- `supabase/checks/verify_ai_explorer.sql`
- `supabase/functions/runtime.d.ts`
- `supabase/functions/atlas-ai-explorer/{index.ts,handler.ts,engine.ts,explorer.test.ts,deno.json,deno.lock}`
- `supabase/functions/_shared/{explorer-domain.ts,openai.ts}`
- `supabase/functions/_shared/atlas/{domain.ts,contracts.ts,config.ts,geoapify.ts,routing.ts,weather.ts,weatherPolicy.ts,tripSchedule.ts}`
- `src/services/{aiExplorer.ts,tripSchedule.ts}`
- `src/components/ExplorerProposals.tsx`
- `tsconfig.edge.json`, `supabase-local.sh`
- `docs/ai-explorer.md`, `docs/ai-explorer-ui.jpg` (verifica dell’interfaccia, non una risposta AI reale)

Modificati:

- `src/domain.ts`, `src/services/{contracts.ts,config.ts,geoapify.ts,routing.ts,weather.ts,weatherPolicy.ts}`: riesportazioni dei moduli condivisi; le integrazioni mantengono le stesse implementazioni e configurazioni frontend.
- `src/services/explorer.ts`: nota esplicita sui vecchi helper locali; la UI di produzione usa il servizio Edge autenticato.
- `src/services/weather.test.ts`, `src/account/security.test.ts`
- `src/hooks/useTripWeatherSchedule.ts`
- `src/components/{Explorer.tsx,Trips.tsx}`, `src/App.tsx`
- `src/styles/lifestyle.css`
- `package.json`, `package-lock.json`, `.gitignore`, `vite.config.ts`, `docs/weather.md`

Nessun file `.env.local` modificato, nessuna credenziale aggiunta al codice, nessuna modifica eseguita sul database remoto.
