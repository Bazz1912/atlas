# Costi semplici in ATLAS

**Aggiornamento card Viaggi:** il selettore Utilitaria/Sportiva/SUV applica ora 5,5/7,5/7,0 L/100 km nel frontend e mostra il pedaggio alternativo nella riga principale. Vedi [selettore auto e riepilogo aggiornato](car-selector-trip-card.md). I dettagli seguenti descrivono anche il calcolo base precedente e i servizi backend, rimasti invariati.

Versione locale aggiornata il 28 ottobre 2026. Sostituisce la precedente impostazione con profili auto. Nessuna operazione sul database remoto, nessun secret modificato, nessuna Edge Function pubblicata e nessuna chiamata live HERE/OpenAI a pagamento durante lo sviluppo.

## Interfaccia

“La mia auto”, i suoi moduli, il servizio di preferenze veicolo e la relativa tabella nella migrazione non ancora applicata sono stati rimossi. Nessun dato remoto viene cancellato. Restano grafica, autenticazione, foto, recensioni, mappe condivise, Geoapify, meteo e AI esistenti.

Nel modulo **Nuova esperienza / Modifica esperienza**, subito sotto **Titolo**, compare **Costo (facoltativo)** con scelta **A persona / Totale**. È sempre visibile, anche cambiando tra Da fare e Già fatto. Vuoto significa non indicato; 0 significa gratis; importi positivi sono prezzi inseriti. Il primo stato mostra la nota “Prezzo indicativo o previsto”, il secondo “Quanto è costata l’esperienza”. Scheda e lista mostrano il prezzo e la modalità, oppure “Costo non indicato”. Il JSON `data.cost` passa alla RPC Supabase già esistente: non viene salvato soltanto nello stato React. La modifica non cambia foto/recensioni.

**Salvati** ha un semplice filtro Prezzo. Nei filtri della **Mappa** è disponibile lo stesso controllo. Opzioni: tutti, gratis, fino a 20/50/100 €, massimo personalizzato, prezzo non indicato. Il limite confronta la spesa totale per il numero di persone scelto, inizialmente 1: un prezzo a persona viene moltiplicato, un totale no. Per esempio, 15 € a persona in due vale 30 €; un totale di 25 € resta 25 €. Con un limite di 25 €, entra solo il secondo. I prezzi sconosciuti sono inclusi in Tutti, esclusi dai limiti/Gratis e selezionabili con l’opzione dedicata. I filtri restano dello stesso tipo degli altri filtri di sessione.

In **Viaggi** compare un riquadro **Spesa indicativa**: esperienze, carburante stimato, pedaggi, totale indicativo oppure subtotale noto con breve nota sulle voci mancanti. Nessun dettaglio sui litri, configurazione carburante, parcheggio o contabilità. Persone, budget opzionale e ritorno sono raccolti sotto un dettaglio chiuso. Il preventivo completo non è mai dichiarato quando mancano importi.

## Carburante automatico

Valori centrali non modificabili dall’interfaccia in `supabase/functions/_shared/atlas/costs.ts`:

- Prezzo: **2,09 €/L**.
- Urbano: **6,5 L/100 km**.
- Extraurbano: **4,8 L/100 km**.
- Autostrada: **5,8 L/100 km**.
- Misto: **5,8 L/100 km**.

Sono convenzioni orientative per un’utilitaria a benzina, non caratteristiche certificate di un veicolo. Il routing principale Geoapify fornisce la distanza stradale ma non una classificazione stradale affidabile per questa funzione: usiamo direttamente il consumo misto sull’intero percorso, senza ulteriori API o analisi di classificazione. Formula: `distanceMeters / 1000 / 100 × 5,8 × 2,09`. Non usiamo distanze in linea d’aria. Il prezzo non si aggiorna da servizi esterni.

Il ritorno entra soltanto se selezionato nell’itinerario e ricalcolato dal routing: aggiungiamo una destinazione reale, non raddoppiamo i km. Senza partenza il circuito torna alla prima esperienza. La partenza non scelta non viene inventata; l’AI non garantisce un budget comprensivo dell’avvicinamento sconosciuto.

## HERE esclusivamente per i pedaggi

Geoapify rimane il motore per routing, autocomplete, geocoding, tempi, distanza e geometria visualizzata. Una risposta HERE non può più sostituire `routeSummary` tramite il frontend. Le vecchie bozze con percorso HERE devono essere ricalcolate con Geoapify.

Il pulsante **Stima pedaggi**, abilitato solo con percorso calcolato, chiama esplicitamente `atlas-here-route` autenticata. Nessuna chiamata HERE al movimento mappa, apertura luogo, modifica filtro, numero persone o campo testo. L’AI chiama HERE soltanto durante una ricerca inviata con un vincolo budget, dopo il routing Geoapify. Se le spese note superano già il budget non sprechiamo una chiamata HERE per quella proposta.

HERE Routing v8 resta necessario internamente per calcolare i pedaggi sulla propria proposta, ma il suo risultato è usato soltanto per il pedaggio e per verificarne la coerenza. Richiesta per automobile standard: `return=polyline,summary,tolls`, `spans=length,carAttributes`, `currency=EUR`, `departureTime=any`. Eliminati la richiesta e l’uso di functionalClass, maxSpeed e streetAttributes per analisi carburante. La geometria HERE non viene disegnata al posto di quella Geoapify e non viene usata per il carburante.

Confronto in `supabase/functions/_shared/atlas/tollComparison.ts`, senza chiamate aggiuntive:

- Lunghezza complessiva: differenza relativa al massimo 3%.
- Ogni tratta: differenza al massimo 5%; stesso numero e ordine di tratti.
- Forma ordinata: 128 punti a intervalli regolari lungo ciascuna geometria, scostamento medio entro 100 m e massimo entro 300 m.

Sono soglie prudenziali, non una prova che ogni casello coincida. Con distanza/forma non coerenti o informazioni insufficienti il risultato è `alternative`: nessun importo HERE viene attribuito al viaggio Geoapify o incluso nel suo budget. La UI segnala brevemente il percorso differente. Anche quando compatibile il costo resta preceduto da ~ e indicativo. Un cambiamento di geometria, tappe o distanza invalida l’associazione della stima precedente.

Pedaggi: solo importi EUR effettivamente restituiti; una tariffa cash/carta standard per gruppo, nessuna somma delle alternative. Deduplicazione per fare ID tra sezioni; gruppi sovrapposti uniti, nessuna deduplicazione per semplice nome del casello. Tariffe solo abbonamento/transponder o con condizioni non verificate restano non quantificabili senza idoneità confermata: la UI compatta non introduce configurazioni avanzate. Dati assenti, valuta/tipo non supportati, copertura o tariffe incomplete restano mancanti, mai zero. Zero viene ammesso solo su un risultato esplicitamente senza pedaggi con copertura completa dei relativi attributi e senza avvisi. Geometrie approssimative, avvisi critici e sezioni speciali non verificabili vengono rifiutati.

La documentazione corrente conferma `return=tolls`, EUR convertita quando disponibile e costi best-effort: [guida HERE](https://docs.here.com/routing/docs/routing-v8-tolls-for-route), [riferimento API](https://docs.here.com/routing/reference/routing-api-v8-calculateroutes). Il supplemento di transazione tolls appartiene al servizio HERE già previsto; non abbiamo attivato nuovi servizi/piani o modelli di consumo a pagamento.

## Budget AI

Il selettore vede solo i costi realmente salvati, modalità a persona/totale, partecipanti e limite. Il codice calcola esperienze + carburante convenzionale sui km Geoapify + pedaggi HERE compatibili quando disponibili. Controlla inoltre guida, soste e meteo come prima.

Spese note oltre il limite → proposta scartata. Prezzi o pedaggi mancanti/percorso alternativo → totale incompleto e “budget non garantito”. Nessuna invenzione di prezzi, distanze o tempi. In assenza di partenza non viene garantito il budget completo della guida; vincoli temporali obbligatori continuano a richiedere una partenza reale. Aprendo in Viaggi restano partecipanti, budget, soste, tappe, ritorno, percorso Geoapify e stima pedaggi associata. Il salvataggio del viaggio resta esplicito.

## Migrazione manuale esatta

La migrazione principale `202610260001_multiuser.sql` resta invariata e non va rieseguita. Per queste modifiche applicare **una sola volta** la versione ora semplificata:

`supabase/migrations/202610260003_trip_costs.sql`

Non è stata applicata da Codex. Mantiene validazione del costo facoltativo nel JSON esperienze e di partecipanti/budget/ritorno nel JSON viaggi; crea soltanto tabelle private HERE usage/cache e le due RPC server. **Non crea profili veicolo.** Le RPC già esistenti persistono gli interi JSON; non servono colonne duplicate o riscritture dei dati salvati.

Non contiene DROP/TRUNCATE né cancellazione di luoghi, mappe, foto, viaggi o recensioni. Solo il nuovo gate ripulisce la propria cache temporanea oltre un giorno; FK delle nuove cache eliminano le loro sole righe quando viene cancellato l’account/mappa. RLS e policy dei dati ATLAS esistenti non vengono allargate. `supabase/checks/verify_trip_costs.sql` è di sola lettura e restituisce cinque controlli `ok=true` dopo l’applicazione.

Per AI resta necessaria la precedente `202610260002_ai_explorer.sql`, soltanto se non già applicata. Non rieseguire migrazioni applicate e non usare `db push` per riallineare uno storico eseguito manualmente. Se una versione precedente della 003 fosse stata applicata contrariamente al presupposto di questa richiesta, non rieseguirla: occorre prima confrontare lo schema; nessuno script di cancellazione di dati remoti è stato preparato.

## Secret e pubblicazione manuale

Mantieni **HERE_API_KEY** nei Supabase Secrets, mai frontend/VITE o `.env.local`. Restano invariati i secret Supabase, Geoapify e OpenAI. L’AI continua a usare `GEOAPIFY_API_KEY` sul server per il proprio routing. Origini ammesse tramite `ATLAS_ALLOWED_ORIGINS` come già predisposto.

Da Terminale nella cartella ATLAS:

```sh
cd /Users/marketing3/Desktop/ATLAS
./supabase-local.sh login
./supabase-local.sh functions deploy atlas-here-route --project-ref fuavwnjyjxqxbqsulugz --use-api
./supabase-local.sh functions deploy atlas-ai-explorer --project-ref fuavwnjyjxqxbqsulugz --use-api
```

Entrambe restano con `verify_jwt=true` e verifica `auth.getUser`. Le letture di mappe/esperienze usano il JWT dell’utente; controllo membri/proprietario e controllo finale prima della risposta. Service role soltanto per quota/cache. Nessuna disabilitazione JWT, modifica Auth o nuova policy permissiva.

Gate HERE invariato: 6/minuto e 60/giorno per utente, 30/minuto e 300/giorno globali; cache privata 10 minuti per sequenza di coordinate, mappa e utente; richieste simultanee identiche bloccate. Corpo endpoint limitato a 32 KiB per includere il campionamento Geoapify, timeout 25 s provider/35 s endpoint. Nessuna chiave o URL con chiave nei log. L’AI mantiene anche i limiti OpenAI precedenti. Quote sono richieste, non un tetto monetario contrattuale: controllare i limiti del proprio account HERE.

## Verifiche e prova

Typecheck frontend/Edge, Vitest, build PWA e Deno check. SQL testato con PostgreSQL locale PGlite, mai sul database remoto. Coperti: creazione senza costo/0/positivo Da fare e Già fatto, aggiornamento costo con recensioni conservate, prezzi condivisi e negazione a estranei, filtri/gruppo, carburante convenzionale, ritorno stradale separato, tariffe alternative/cache/limiti, distanze simili con geometrie diverse, stime invalidate, budget AI incompleti e nessuna chiamata HERE senza richiesta utile.

Browser: moduli reali testati isolatamente senza invii remoti; salvataggio UI con costo vuoto e costo zero, varianti Da fare/Già fatto, filtro personalizzato, schermi 390×844 e 320×568 senza overflow. Screenshot aggiornati `docs/experience-cost-mobile.png` e `docs/trip-cost-layout-mobile.png`, etichettati come verifica locale. Nessun test su telefono fisico o chiamata live HERE/OpenAI.

Aprire **http://127.0.0.1:5173/** in Chrome. Provare: creare luogo senza prezzo, gratuito, a persona e totale; modificare prezzo; filtrare per 2 persone; costruire viaggio e calcolare Geoapify; osservare carburante automatico; premere Stima pedaggi dopo configurazione/deploy. Confrontare un itinerario con ritorno e uno senza. Salvare/ricaricare viaggio e prezzi anche da un altro membro della mappa condivisa. Provare AI con “massimo 100 € in due”: controllare spese note e avvisi sugli importi mancanti. Queste ultime verifiche remote restano manuali dopo migrazione e deploy.
