# Preparazione locale di ATLAS per GitHub Pages

Verifica del 28 ottobre 2026. Repository futuro: **atlas**. Account GitHub ancora da scegliere. Nessun repository creato o collegato, nessuna pubblicazione, nessun intervento su Supabase remoto, Auth, secret, SQL o Edge Functions.

## Esito

Il frontend React/Vite/TypeScript e PWA è pronto per una pubblicazione tramite GitHub Actions, dopo i passaggi manuali riportati sotto. Il sito pubblico non esiste ancora: login, email di conferma/reset, API e installazione PWA dovranno ricevere una verifica finale dal dominio reale dopo la prima pubblicazione. Nessuna funzionalità o grafica dell’app è stata cambiata.

### Percorso automatico

Il workflow legge `base_path` dai metadati Pages con `actions/configure-pages`. Per un repository di progetto `atlas` il percorso è `/atlas/`; per un sito radice o dominio personalizzato Pages fornisce la radice. Nessuno username è scritto nel codice. Vite normalizza slash iniziale/finale e rifiuta path incoerenti. In locale il dev server resta `/`.

Indirizzo previsto, finché l’account non sarà scelto:

`https://<ACCOUNT>.github.io/atlas/`

`<ACCOUNT>` è un segnaposto da sostituire manualmente con il nome dell’account/organizzazione, non un URL già disponibile.

### Navigazione e URL diretti

Mappa, Salvati, AI Explorer e Viaggi sono viste React sullo stesso documento, senza router con percorsi `/viaggi` o `/salvati`. La navigazione non genera URL che richiedono riscritture server. Apertura diretta e refresh devono usare `/atlas/`; le viste vengono gestite dall’app come prima.

Registrazione e reset usano già `import.meta.env.BASE_URL`: il ritorno è `/atlas/` oppure `/atlas/?recovery=1`, senza hardcoding localhost. Non sono state aggiunte finte pagine o un fallback 404 che nasconda risorse mancanti. URL arbitrari come `/atlas/inesistente` non sono indirizzi emessi dall’app e sul server statico restituiscono 404 prima dell’eventuale service worker. Se in futuro verranno introdotte rotte condivisibili, usare hash routing oppure progettare esplicitamente il fallback Pages.

### PWA e risorse

Manifest `id`, `start_url` e `scope` usano lo stesso base path; standalone è mantenuto. Registrazione e scope del service worker e fallback di navigazione puntano a `/atlas/`. Le icone, compresa maskable, e le risorse Vite sono sotto quel percorso. Il controllo dell’artifact verifica anche le dimensioni PNG del manifest.

Il worker mette in precache soltanto la shell statica e gli asset. Nessuna nuova cache di dati Supabase, API, token o foto private. Installare la PWA non rende disponibili offline tutte le integrazioni, come già indicato nell’app. Il dominio Pages HTTPS è adatto alla PWA; test fisico su Safari/iPhone e Chrome/Android ancora da fare dopo pubblicazione.

## Impostazioni GitHub da effettuare manualmente in futuro

1. Creare il repository `atlas` con branch `main`. Il repository locale attuale ha branch main, **0 file tracciati e nessun remote**. Nessun commit, staging o collegamento GitHub effettuato da Codex. Prima di condividere i file controllare `git status` e i contenuti da aggiungere; evitare `git add -f` sui file ignorati.
2. Repository → Settings → Pages → Build and deployment → Source: **GitHub Actions**. Il workflow deve essere presente in `.github/workflows/pages.yml`. Le condizioni del proprio piano GitHub determinano se Pages può essere usato da repository privato; un repository pubblico è l’opzione standard. Il sito Pages non è protetto dalla visibilità privata dei dati Supabase: è l’autenticazione/RLS dell’app a proteggerli.
3. Settings → Secrets and variables → Actions → **Variables**:

| Nome | Valore da inserire personalmente |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL HTTPS del progetto esistente |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key, oppure legacy anon key; mai service_role |
| `VITE_MAP_STYLE_URL` | Facoltativo: lasciare assente per lo stile attuale |

4. Actions → **Secrets**: `VITE_GEOAPIFY_API_KEY`, con la chiave **browser** già protetta per dominio/referrer. Un Actions secret evita di scrivere il valore nei sorgenti/log, ma non lo rende segreto nel JavaScript pubblicato.
5. Non impostare uno username o un base path manuale: il workflow ricava il percorso dal repository Pages. Se si usa un altro branch, aggiornare consapevolmente il trigger ora limitato a `main`.
6. Consentire l’esecuzione di GitHub Actions e l’environment `github-pages`, con le eventuali approvazioni desiderate. Build: lettura contenuti/metadata Pages. Deploy: `pages: write` e `id-token: write`; nessun PAT o token Supabase richiesto dal workflow.
7. Un push su main o avvio manuale esegue installazione da lockfile, audit, typecheck, test, build e verifica dell’artifact prima del deploy. Viene caricato esclusivamente **dist**, non la cartella del progetto. Non c’è `pull_request_target`, nessuna migrazione e nessun deployment delle Edge Function.

Il workflow fallisce con messaggi senza valori riservati se mancano URL/publishable key/Geoapify o se viene configurata una variabile `VITE_*` non prevista o una chiave Supabase non pubblicabile.

## Valori pubblicabili e secret server

| Tipo | Dove rimane | Visibilità |
| --- | --- | --- |
| Project URL Supabase e publishable/anon key | Variabili build frontend | Visibili nel browser: previsto da Supabase, accessi soggetti a RLS |
| Geoapify browser key | Actions secret → bundle frontend | Visibile nel browser: proteggere origini/referrer e quote |
| `OPENAI_API_KEY`, `HERE_API_KEY`, Geoapify server key | Supabase Secrets delle funzioni esistenti | Mai nella build frontend |
| Supabase service role / secret key, CLI access token | Solo ambiente server o strumenti locali protetti | Mai repository, artifact o variabili VITE |
| `ATLAS_ALLOWED_ORIGINS`, `OPENAI_MODEL` | Configurazione server già esistente | Non servono alla build Pages |

Il backend Supabase e le funzioni già pubblicate continuano a essere usati. GitHub Pages serve esclusivamente i file statici; non può custodire chiavi provider private o eseguire le funzioni server.

### Audit Git

`.env.local`, tutti gli env reali, strumenti/cache locali, metadata CLI Supabase, configurazioni credenziali, file chiave, backup ed esportazioni non sono candidati al commit. Solo il template radice `.env.example` vuoto è consentito. Le schermate QA `docs/*.png|jpg|jpeg|webp`, che possono contenere nomi e mappe personali, sono ora ignorate; le icone pubbliche in `public/icons/` restano incluse.

`npm run audit:publish` controlla file tracciati **e** candidati non ignorati, firme di secret, JWT service_role e eventuali valori delle chiavi locali incollati nei sorgenti. Non stampa il valore delle corrispondenze. Controlla anche le regole ignore su percorsi sensibili. L’audit non equivale a una garanzia universale: prima del primo commit e di ogni push controllare sempre lo staging. Il repository non ha ancora file tracciati: nessun segreto già presente in una cronologia pubblicata è stato rilevato o rimosso.

## URL da autorizzare manualmente

Non modificati durante questa attività. Quando l’account sarà noto:

**Supabase → Authentication → URL Configuration**

- Site URL: `https://<ACCOUNT>.github.io/atlas/`
- Redirect URLs: `https://<ACCOUNT>.github.io/atlas/`
- Redirect URLs: `https://<ACCOUNT>.github.io/atlas/?recovery=1`
- Conservare le origini/redirect localhost e 127.0.0.1 già autorizzati se si continuerà lo sviluppo locale.

Verificare che eventuali template email personalizzati rispettino `RedirectTo` anziché forzare localhost. Nessuna modifica a template, conferma email o password eseguita.

**Supabase → Edge Functions → Secrets → `ATLAS_ALLOWED_ORIGINS`**

Aggiungere, senza rimuovere i valori attuali:

`https://<ACCOUNT>.github.io`

È un’**origine**, quindi **senza `/atlas/` e senza slash finale**. Vale per entrambe le funzioni `atlas-ai-explorer` e `atlas-here-route`; JWT deve restare attivo. Non sostituire il secret con un valore contenente segnaposti.

**Geoapify → chiave browser**

Autorizzare l’origine effettiva `https://<ACCOUNT>.github.io` oppure il referrer della stessa origine secondo la configurazione Geoapify. ATLAS usa una referrer policy che nelle chiamate cross-origin può inviare soltanto l’origine: non vincolare la chiave esclusivamente al sottopercorso `/atlas/`. Il pannello Geoapify supporta anche pattern regex per referrer: usarli soltanto dopo aver sostituito l’account e verificato le richieste. Conservare i referrer di sviluppo se necessari. Impostare soltanto il CORS della risposta Geoapify non sostituisce una restrizione di accesso della chiave.

**HERE / OpenAI**

Le chiavi restano sul server Supabase; non vanno autorizzate come chiavi browser o copiate su GitHub. Le richieste partono dalle funzioni esistenti. Per il futuro dominio serve l’origine CORS sopra, non una modifica a database, migrazioni o logica delle funzioni. Geoapify server deve mantenere restrizioni compatibili con richieste server, distinte da quelle browser.

## Controlli svolti e limiti

- Audit locale completato senza trovare secret nei candidati al commit; valori riservati mai stampati.
- Typecheck React/TypeScript e codice Edge, **164 test in 14 file**, build PWA riusciti.
- Build e controllo artifact riusciti sia per `/` sia per `/atlas/`.
- Manifest, icone reali e dimensioni, file HTML/CSS/JS, worker e scope verificati nel dist.
- Anteprima su server **statico senza fallback Vite**, sotto `/atlas/`: HTML, query recovery, manifest, worker e icone HTTP 200; risorsa inesistente 404; directory senza slash redirezionata.
- Apertura diretta e reload nel browser della produzione `/atlas/`: login attuale visibile, nessun errore console; link CSS/JS/manifest/icon corretti sotto `/atlas/`.
- La porta 4173 aveva un vecchio service worker locale che restituiva una versione storica. Il controllo è stato ripetuto su una nuova origine locale, senza eliminare dati o cache dell’utente. Per ripetere una prova usare una porta pulita o gestire consapevolmente le vecchie registrazioni di sviluppo.
- Nessuna verifica dal dominio GitHub reale ancora possibile: manca l’account/repository e il sito non è stato pubblicato. Login, conferma email/reset, Storage, condivisione, autocomplete/routing, meteo, AI e pedaggi devono essere provati dal dominio definitivo dopo le autorizzazioni. Nessun account, richiesta AI o pedaggio di prova creato per questa attività.

## Ripetere i controlli locali

```sh
./npm-local.sh run audit:publish
./npm-local.sh run typecheck
./npm-local.sh test
VITE_BASE_PATH=/atlas/ ATLAS_PAGES_BUILD=true ./npm-local.sh run build
VITE_BASE_PATH=/atlas/ ./npm-local.sh run check:pages
./npm-local.sh run preview:pages -- --base=/atlas/ --port=4187
```

L’anteprima è **locale**, `http://127.0.0.1:4187/atlas/`: non è una pubblicazione e non va usata come server di produzione. Il dev server principale su 5173 resta separato.

## File di questa preparazione

Modificati: `vite.config.ts`, `.github/workflows/pages.yml`, `.gitignore`, `.env.example`, `package.json`, `README.md`.

Aggiunti: `build/pages-config.ts`, `scripts/audit-publish.mjs`, `scripts/check-pages-build.mjs`, `scripts/preview-pages.mjs`, `src/services/pages-config.test.ts`, `docs/github-pages.md`.

Nessuna modifica a componenti dell’app, database, SQL, funzioni server o credenziali locali.

Fonti ufficiali consultate: [Vite static deploy](https://vite.dev/guide/static-deploy.html#github-pages), [GitHub Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Vite PWA deployment](https://vite-pwa-org.netlify.app/deployment/), [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Geoapify key restrictions](https://myprojects.geoapify.com/help/api-keys/). Sono riferimenti pubblici; nessun accesso o collegamento ad account GitHub.
