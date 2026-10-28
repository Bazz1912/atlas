# Selettore auto e riga Pedaggi in Viaggi

Aggiornamento locale del 28 ottobre 2026. Nessuna modifica remota, nuova migrazione, profilo veicolo o libreria aggiuntiva. Generazione AI, autenticazione, mappe e routing non modificati.

## Card

Sotto “Spesa indicativa” compare un unico controllo orizzontale a tre opzioni: **Utilitaria**, **Sportiva**, **SUV**. Sagome SVG diverse: city car compatta, sportiva bassa e SUV alto. Selezione lavanda, radio native accessibili, transizioni leggere e nessuno scorrimento orizzontale a 320 px.

Consumi convenzionali, fissi nel modulo frontend `src/services/tripSpending.ts`:

- Utilitaria (iniziale): **5,5 L/100 km**.
- Sportiva: **7,5 L/100 km**.
- SUV: **7,0 L/100 km**.

Il prezzo resta quello centrale esistente: **2,09 €/L**. La card applica il consumo misto scelto all’intera distanza stradale del viaggio; nessuna nuova classificazione stradale o configurazione manuale. Componenti monetarie, somma e residuo sono arrotondati coerentemente ai centesimi.

Cambiare categoria aggiorna immediatamente carburante, subtotale, scenario indicativo e residuo sulle spese note. Non chiama HERE, Geoapify o AI, non cambia geometria, km, ritorno o pedaggi. Le categorie grafiche non sono classi di pedaggio.

La scelta è `trip.budget.carCategory`, opzionale (`city`, `sport`, `suv`). Le RPC e il repository già persistono/rileggono il JSON completo. Alla riapertura la scelta viene conservata; viaggi precedenti senza campo partono da Utilitaria. La tipizzazione condivisa aggiunge soltanto quel campo opzionale, senza cambiare runtime delle Edge Function. Nessuna nuova migrazione SQL necessaria.

Le proposte AI aperte in Viaggi attraversano la stessa card e lo stesso calcolo locale: nessun costo carburante precompilato viene riutilizzato nella card, che ricava la stima dai km e dalla categoria del viaggio. Il generatore AI non è stato modificato.

## Pedaggi

Se c’è una tariffa standard oppure una singola tariffa condizionata effettivamente restituita da HERE, l’importo compare direttamente nella riga **Pedaggi**. Per un percorso alternativo si aggiungono una piccola icona informativa e la nota “Stima HERE su percorso alternativo, esclusa dal subtotale”. Una condizione come “Transponder richiesto” rimane visibile: non viene presunta l’idoneità del veicolo/utente a quella tariffa.

Eliminato il vecchio blocco separato con importo ripetuto e le spiegazioni duplicate. Se non c’è una tariffa unica quantificabile, restano “Non disponibili” e, se esistono più opzioni, i dettagli delle tariffe realmente ricevute. Nessun prezzo inventato o somma delle alternative.

Il subtotale Geoapify continua a escludere i pedaggi alternativi. Quando la tariffa alternativa è quantificabile e la copertura completa, un secondo valore discreto **“Con pedaggio indicativo”** mostra spese note + tale stima, dichiarata dalla nota come alternativa. I dati mancanti mantengono il totale incompleto e il budget non garantito. Un pedaggio compatibile ed eleggibile entra una sola volta nel normale totale.

Timeout, accorpamento richieste e riuso delle stime recenti restano quelli della correzione precedente. Il selettore non effettua alcuna chiamata ai servizi.

## Verifiche

- **162 test passati in 13 file**, typecheck frontend/Edge e build PWA.
- Formule per i tre consumi, prezzo fisso, ricalcolo locale e assenza di fetch.
- Pedaggio invariato cambiando auto, condizioni transponder, nessun doppio conteggio, prezzi mancanti e riferimenti di percorso invalidati.
- Persistenza del nuovo campo nel JSON con RPC/RLS PostgreSQL locale PGlite, anche leggendo il viaggio da un altro membro della mappa condivisa. Nessun database remoto usato per questi test.
- Handoff da proposta AI e fallback Utilitaria.
- UI dei componenti reali verificata a 320×568 e 390×844; tre opzioni da almeno 62 px in altezza e circa 74 px di larghezza a 320 px, senza overflow. Provati tocchi su Sportiva/SUV/Utilitaria e valori aggiornati immediatamente.
- Schermate `docs/car-selector-320.png` e `docs/car-selector-390.png`: dati di test esplicitamente etichettati, nessuna richiesta API o scrittura remota. Non rappresentano un nuovo preventivo reale HERE.

## File principali

`src/components/CarCategorySelector.tsx`, `src/components/TripCostCard.tsx`, `src/services/tripSpending.ts`, `src/services/tollFeedback.ts`, `src/styles/costs.css`, campo opzionale in `supabase/functions/_shared/atlas/domain.ts`.

Nessun deployment delle Edge Function richiesto. Avvio locale: `./npm-local.sh run dev`, URL http://127.0.0.1:5173/.
