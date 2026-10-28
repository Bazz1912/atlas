> Documento storico della revisione 0.2. Per lo stato attuale consultare README.md e migrazione-v3.md. Le indicazioni di attivazione cloud richiedono ora l’adattatore completo 0.3.

# ATLAS V2

React PWA personale, mobile-first, con mappa mondiale MapLibre e cartografia reale OpenFreeMap. La precedente landing page è stata rimossa. Quattro sezioni: **Mappa, Salvati, AI Explorer, Viaggi**. Salvati riunisce Wishlist e Journal.

## Stato del progetto

Questa consegna realizza la nuova struttura UX/UI e il primo flusso di archivio esperienze. Non dichiara completato l’intero progetto V2.

| Area | Implementazione | Limiti di verifica |
| --- | --- | --- |
| Mappa | MapLibre reale, OpenFreeMap dark personalizzato, zoom/pan, pin e clustering nativi | Richiede Internet e WebGL; niente immagini sostitutive |
| Mobile | Schermo intero, quattro tab, FAB, ricerca flottante, filtri, safe area, sheet trascinabile/espandibile | QA browser responsive; collaudo hardware iPhone/Android ancora necessario |
| Esperienze | Crea TO_DO o DONE, modifica, categorie, priorità, note, cambio stato bidirezionale | Nessun dato precompilato nell’app |
| Posizione | Punto reale scelto sulla mappa, coordinate, correzione pin | Il nome manuale non è un indirizzo verificato |
| Autocomplete | Adattatore Geoapify, debounce e cancellazione richieste | Richiede chiave con restrizioni; non verificato contro API autenticata |
| Foto | Selezione, anteprima, compressione JPEG max 1600 px, persistenza locale; upload Storage in modalità cloud | JPG/PNG/WebP; HEIC va convertito. Storage richiede configurazione |
| Archivio locale | IndexedDB, persistenza, ricerca, filtri combinati, ordinamento, export JSON | Solo browser/origine attuali; nessuna condivisione o migrazione automatica |
| Archivio condiviso | Adattatore Supabase, Anonymous Auth, controllo membership, foto private con URL firmati | Schema e servizi non applicati a un progetto remoto; test reali da eseguire |
| PWA | Manifest, icone PNG, Apple touch icon, standalone, service worker con aggiornamento su richiesta | Produzione su HTTPS; nessuna promessa di cartografia offline |
| GitHub Pages | Workflow pronto, base path dinamico, build statica senza route server | Nessun repository remoto collegato, nessuna pubblicazione eseguita |
| Journal | DONE consultabili in Salvati e schema SQL per visite e recensioni separati | UI recensioni, storico visite e profili ancora da implementare |
| Viaggi / AI | Destinazioni di navigazione con stato esplicito di indisponibilità | Nessun routing, risposta AI o tempo di guida simulato |

## Avvio locale

```sh
cd /Users/marketing3/Desktop/ATLAS
./npm-local.sh run dev
```

Apri **http://127.0.0.1:5173/**. Porta fissa; `Ctrl+C` ferma il server. Se un server è già attivo, usa quello o arrestalo prima di avviarne un altro.

Node.js non era presente sul Mac. La distribuzione ufficiale **24.22.0 per macOS Intel**, con npm **11.19.1**, è in `.tools/node/` ed è stata verificata tramite SHA-256. `npm-local.sh` usa questa copia o, in sua assenza, il Node installato nel sistema. Cache npm, runtime e dipendenze restano nella cartella del progetto e sono esclusi da Git.

Per installare Node normalmente: scarica l’installer macOS **LTS** da <https://nodejs.org/en/download>, eseguilo, riapri il Terminale, verifica `node --version` e `npm --version`. Su un altro computer con Node 24 LTS usa `npm ci`.

```sh
./npm-local.sh test
./npm-local.sh run build
./npm-local.sh run preview -- --port 4173 --strictPort
```

La preview della build è **http://127.0.0.1:4173/**. Service worker e manifest sono generati dalla build di produzione, non dal server dev. Origini/porte diverse hanno archivi locali diversi: un’esperienza su 4173 non compare su 5173.

## UX e flussi

- Mappa da bordo a bordo. Desktop: rail laterale, pannello luoghi e mappa; nessuna home marketing.
- Tutto / Da fare / Già fatto conserva la scelta in localStorage. Categoria e priorità sono filtri combinati. Una priorità esclude DONE, che non hanno priorità.
- Premi **+** per aprire il modulo a tutta altezza. Inserisci titolo, categoria, posizione e, per TO_DO, priorità.
- Senza Geoapify, scegli un punto sulla mappa: tocca il punto oppure usa il mirino e **Usa questo punto**. Assegna un nome manuale al luogo; non viene fatto geocoding fittizio.
- Tocca un pin per aprire il dettaglio. Trascina la maniglia verso l’alto per espanderlo, verso il basso per ridurlo; un trascinamento ulteriore chiude la scheda ridotta. La maniglia funziona anche come pulsante da tastiera.
- **Segna come fatto** conserva il luogo e rimuove la priorità. **Voglio tornarci** torna a TO_DO con priorità media, modificabile nel modulo.
- I DONE sono ciano con check; TO_DO verde/giallo/rosso secondo priorità. Nessuna valutazione viene assegnata automaticamente.
- Geolocalizzazione solo premendo l’apposito controllo e con autorizzazione del browser. La posizione non viene salvata né interpretata come Casa.
- Dialog nativi per focus contenuto e chiusura con Escape; motion ridotto se richiesto dal sistema; input a 16 px per evitare zoom dei form su iOS.
- Settings → **Esporta backup JSON** esporta l’archivio attualmente selezionato. Il ripristino/import JSON non è ancora implementato.

## Architettura

```text
src/
  App.tsx                  navigazione e coordinamento dei flussi
  domain.ts                tipi, validazione, filtri e ordinamento
  components/
    WorldMap.tsx           ciclo di vita MapLibre, GeoJSON, cluster e geolocalizzazione
    mapTheme.ts            colori e nomi della cartografia OpenFreeMap
    Sheet.tsx              dialog, trascinamento ed espansione
    PlaceSearch.tsx        ricerca salvati e autocomplete reale
    ExperienceForm.tsx     creazione e modifica con foto e posizione
    ExperienceDetails.tsx  dettaglio e cambio stato
  hooks/useExperiences.ts  caricamento e aggiornamento archivio
  services/
    config.ts              configurazioni pubbliche opzionali
    repository.ts          adapter IndexedDB e Supabase
    geocoding.ts           Geoapify autocomplete
    photos.ts              compressione e serializzazione foto
  styles/sheets.css        sheet, moduli e dettagli
supabase/migrations/       schema SQL e RLS
```

MapLibre e il suo worker sono caricati in chunk separati. Non ci sono router server-side: le quattro sezioni sono stato dell’app, quindi il refresh su GitHub Pages non causa 404 di route.

## Configurazioni pubbliche

Copia `.env.example` in `.env.local`, compila solo i campi necessari e riavvia Vite. Nessuna chiave è già presente.

| Variabile | Scopo |
| --- | --- |
| `VITE_BASE_PATH` | `/` in locale; `/<repository>/` per Pages di progetto |
| `VITE_MAP_STYLE_URL` | Facoltativa; default OpenFreeMap dark, nessuna chiave |
| `VITE_GEOAPIFY_KEY` | Chiave browser Geoapify limitata per domini e quote |
| `VITE_SUPABASE_URL` | URL del progetto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Solo chiave pubblica/publishable; mai service_role o secret key |
| `VITE_WORKSPACE_ID` | UUID dello spazio creato dall’amministratore |

Tutte le variabili `VITE_*` sono leggibili dal browser e nel bundle. **OPENAI_API_KEY non deve essere inserita qui, in localStorage, nel repository o nelle variabili frontend delle Actions.**

### Supabase: procedura fase 1

1. Crea un progetto Supabase. Nel SQL Editor esegui `supabase/migrations/202610230001_initial.sql` su un database nuovo. La migrazione è transazionale e non va rieseguita alla cieca: modifiche successive richiedono nuove migrazioni.
2. In Authentication abilita **Anonymous Sign-Ins**. In produzione configura limiti e protezione anti-bot; la UI CAPTCHA non è ancora integrata, quindi l’eventuale abilitazione di CAPTCHA richiederà il relativo flusso frontend.
3. Nel SQL Editor crea uno spazio, prendendo nota dell’UUID restituito:

   ```sql
   insert into public.workspaces(name) values ('ATLAS personale') returning id;
   ```

4. Configura URL, publishable key e workspace ID in `.env.local`; riavvia il server. Settings → **Connetti spazio condiviso** crea o riusa l’identità anonima e mostra il suo UUID. Non autorizza automaticamente quell’identità allo spazio.
5. Per ognuno dei due dispositivi/utenti, l’amministratore aggiunge l’UUID mostrato dall’app:

   ```sql
   insert into public.workspace_members(workspace_id, user_id)
   values ('UUID_SPAZIO', 'UUID_IDENTITA');
   ```

6. Premi **Aggiorna archivio**. L’app legge e salva le esperienze condivise usando le policy RLS. Gli aggiornamenti dell’altro dispositivo richiedono refresh manuale: nessuna subscription Realtime in questa fase.

Lo spazio locale e quello condiviso sono separati. La connessione non copia automaticamente i dati locali. Se la modalità cloud fallisce, l’app segnala l’errore e **non simula un salvataggio cloud tornando al locale**. La scelta dello spazio viene ricordata nel browser.

#### Sicurezza e identità

- Solo membri esplicitamente abilitati leggono e modificano le esperienze dello spazio. Il browser non può creare spazi, assegnare membership o eliminare esperienze.
- RLS distingue l’UID autenticato dal nome visualizzato. Cambiare nome non attribuisce un’altra identità né consente di modificare recensioni altrui.
- La migrazione prepara visite e recensioni normalizzate, con rating NULL distinto da 0 e vincolo esatto di incrementi 0,5. L’UI Journal, la gestione delle visite e i flussi di scrittura coordinati sono ancora da implementare.
- Nessuna posizione Casa è memorizzata in questa fase. In futuro va in una tabella privata per proprietario, non nell’archivio condiviso.
- Un’identità anonima può essere persa cambiando dispositivo, cancellando il browser o perdendo la sessione. Non c’è ancora recupero con magic link. Non usare il solo nome come meccanismo di recupero.
- I membri possono aggiornare le esperienze comuni: la gestione dei conflitti concorrenti è attualmente “ultima scrittura”. Non è ancora presente una cronologia delle modifiche.

#### Storage fotografie

La migrazione crea il bucket **privato** `experience-images` (JPEG, max 5 MB), con accesso riservato ai membri. Il percorso include spazio/utente/esperienza/UUID. Le foto vengono compresse prima dell’upload. URL firmati validi un’ora; per rinnovarli aggiorna l’archivio.

Se il salvataggio DB fallisce dopo un upload, il client tenta di eliminare il nuovo file. Le vecchie foto sostituite o scollegate restano nel bucket: prevedere pulizia amministrativa degli orfani dopo il backup. Nessuna immagine è resa pubblica.

### Geoapify

Crea una chiave nel pannello Geoapify, imposta domini consentiti (localhost per sviluppo e dominio Pages in produzione) e limiti di utilizzo. Inseriscila in `VITE_GEOAPIFY_KEY`. L’app invia soltanto il testo digitato nella ricerca; non invia automaticamente archivio o posizione GPS. Le richieste sono ritardate di 400 ms e annullate quando cambia il testo. Questa chiave è pubblica per natura: proteggila con restrizioni e quote del provider.

Autocomplete predisposto ma non collaudato con una chiave reale. Routing stradale ancora da implementare, separatamente: nessuna distanza in linea d’aria viene presentata come tempo di guida.

## PWA e GitHub Pages

Il manifest usa percorsi relativi e base configurabile, icone 192/512, icona maskable con area sicura, touch icon 180 e `display: standalone`. Le icone si rigenerano senza dipendenze con `python3 scripts/generate-icons.py`.

Il service worker precachea l’applicazione e mostra un avviso di aggiornamento; non ricarica automaticamente un modulo aperto. Non vengono messe in cache API private, foto cloud o cartografia esterna. L’interfaccia e l’archivio locale possono funzionare offline dopo la prima installazione; mappa e servizi esterni richiedono rete. Eventuali limiti di rete sono indicati nell’interfaccia.

Per installare su iPhone: usa Safari e un URL HTTPS, Condividi → Aggiungi alla schermata Home. Android: Chrome → menu → Installa app. Una build locale su HTTP aperta da un telefono tramite IP LAN non garantisce service worker/installazione; per il test reale usa un hosting HTTPS. Nessun certificato locale o tunnel è stato configurato.

Il workflow `.github/workflows/pages.yml` è pronto ma **non è stato eseguito** e non è collegato a un account GitHub. Quando deciderai di pubblicare:

1. Crea il repository e carica il codice; controlla che `.env.local`, `.tools/`, `.npm-cache/` e `node_modules/` restino esclusi.
2. In Settings → Pages scegli **GitHub Actions** come sorgente.
3. In Settings → Secrets and variables → Actions → **Variables** configura solo le variabili pubbliche richieste. Non aggiungere segreti OpenAI.
4. Avvia il workflow oppure esegui push su `main`: installa da lockfile, esegue i test, compila con base `/<repository>/` (oppure `/` per un repository `*.github.io`) e pubblica `dist`.
5. Per un dominio personalizzato con app alla radice adatta il base path del workflow a `/`.
6. Prova caricamento, refresh, manifest, worker e installazione sul vero dispositivo. GitHub Pages ospita il frontend; **non pubblica funzioni Supabase** e non rende privato il sito tramite RLS. RLS protegge i dati, non la pagina pubblica.

## Fasi successive

1. **Chiudere fase 1 cloud**: configurare un progetto reale, applicare SQL, abilitare due identità, provare RLS, upload e autocomplete con servizi reali. Testare perdita rete e permessi negati. Non verificato senza tali configurazioni.
2. **Journal**: profili pseudonimi, storico visite, recensioni indipendenti per UID, mezze stelle da 0 a 5, filtri autore/mia/media, più visite dello stesso luogo, recupero identità.
3. **Trip Builder**: tappe TO_DO e DONE, partenza e riordino, soste, Geoapify Routing reale, tratte e durata totale, salvataggio itinerari. Nessun “traffico live” senza dati adeguati.
4. **AI guidata**: wizard, filtri deterministici su archivio autorizzato, ricerca e verifica tempi reali; nessuna chiamata al modello a ogni clic.
5. **OpenAI**: Edge Functions Supabase con Responses API e Structured Outputs. Verifica UID/membership, rate limit persistente per utente, lunghezza prompt/token/budget, validazione schema e degli ID contro candidati reali. Testi di note/descrizioni trattati come dati, mai istruzioni. Nessun modello chiamato dal frontend.
6. **Hardening e pubblicazione**: collaudo iOS/Android hardware, test API/E2E completi, recupero identità, sincronizzazione/conflitti e accessibilità.

### Preparazione futura OpenAI (non ancora implementata)

Quando sarà il momento, crea una chiave nel tuo progetto OpenAI con budget/limiti adeguati. Con Supabase CLI installata e autenticata collega il progetto, salva `OPENAI_API_KEY` nei **Secrets delle Edge Functions** tramite il pannello Supabase (evita history del Terminale) e pubblica solo dopo aver realizzato la funzione e i controlli di accesso. La futura funzione deve verificare il JWT anonimo/autenticato e membership; non basta conoscere l’URL. Le Edge Functions avranno deploy separato dalla build Pages. Nessuna funzione fittizia è fornita o dichiarata pronta in questa fase.

## Verifiche e checklist

`npm test` verifica filtri combinati, priorità, ordinamento senza mutazioni, coordinate, stati, contratto rating, persistenza IndexedDB, creazione diretta DONE e cambio stato senza duplicati. Le fixture di test non sono importate nell’app. I test locali non certificano Supabase, Geoapify o OpenAI.

Prima della pubblicazione:

- [ ] Provare TO_DO e DONE con foto reali su due dispositivi autorizzati.
- [ ] Verificare che utente non membro e anon key senza sessione non possano leggere o scrivere dati/foto.
- [ ] Verificare conservazione dati dopo reload e cambio stato; nessuna recensione assegnata implicitamente.
- [ ] Provare ricerca indirizzi reale, correzione pin, cluster e filtri con dati inseriti dagli utenti.
- [ ] Verificare schema SQL e Storage in un database di collaudo; controllare che le membership non siano modificabili dal client.
- [ ] Provare installazione standalone, tastiera, safe area, rotazione e sheet su hardware iPhone/Android.
- [ ] Provare build nel sotto-percorso Pages e workflow remoto.
- [ ] Completare le fasi Journal, routing e AI e i rispettivi test prima di dichiararli operativi.
- [ ] Ricontrollare bundle e repository: nessun segreto o dato personale.

### Costi, backup e aggiornamenti

Nessun servizio a pagamento è stato attivato. Quote e prezzi dipendono dai provider: controlla i pannelli correnti prima di usare Supabase Storage/egress, Geoapify e OpenAI. Imposta budget e limiti prima di esporre servizi AI. Non ci sono chiamate OpenAI in questa versione.

L’archivio locale è legato a browser e origine e può essere eliminato dal sistema: esporta JSON prima di modificare origine o pulire il browser. L’export include foto locali in data URL. In cloud, il JSON è un export dei record e include URL temporanei, **non** un backup dei file: conserva separatamente dump DB e oggetti Storage dal pannello/strumenti amministrativi Supabase, proteggendoli come dati privati. Un recupero completo non è stato ancora collaudato.

Per aggiornare il codice: conserva backup, modifica il progetto, esegui test e build, quindi pubblica solo se autorizzato. Gli utenti installati ricevono il pulsante di aggiornamento del service worker. Non cambiare nome/versione di IndexedDB senza una migrazione che preservi i dati.
