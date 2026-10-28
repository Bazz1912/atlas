# Pulsante Stima pedaggi: feedback e conclusione richieste

Correzione locale del 28 ottobre 2026. Solo frontend e test; nessuna modifica a funzioni remote, SQL, migrazioni, secret o autenticazione.

## Cause verificate

1. Il pulsante era disabilitato per 10 minuti dopo qualsiasi risposta recente, anche alternativa o senza tariffa utilizzabile. Era una protezione cache senza spiegazione visibile, non necessariamente un caricamento rimasto attivo.
2. La scheda usava correttamente il filtro che esclude i pedaggi alternativi dal totale Geoapify, ma nascondeva anche tutte le informazioni utili di quelle tariffe.
3. L’invocazione Supabase non aveva una scadenza frontend garantita: dipendeva dal completamento del trasporto e dell’eventuale lettura JSON dell’errore.

## Risposta reale

Eseguita una sola richiesta Stima pedaggi dall’app autenticata, usando una bozza locale di verifica con tre luoghi già esistenti. Nessun viaggio o luogo salvato/modificato sul database. La bozza non coincide necessariamente con quella originaria segnalata dall’utente.

Geoapify ha calcolato 205,2 km, carburante convenzionale ~24,87 €. La funzione ha concluso correttamente con `comparison=alternative`. HERE ha restituito una tariffa effettiva di **11,40 €**, per AUTOSTRADE PER L’ITALIA, con **transponder richiesto**. Quindi: non errore di chiave, non assenza di risposta; percorso alternativo e tariffa condizionata, che il precedente frontend escludeva dalla visualizzazione ordinaria.

Ora viene mostrata separatamente come **Pedaggio indicativo su percorso alternativo: ~11,40 €**, insieme a **Transponder richiesto · tariffa da verificare** e all’esclusione esplicita dal totale Geoapify. Il subtotale Geoapify è rimasto ~24,87 €, senza sommare 11,40 €. Le esperienze senza prezzo sono rimaste sconosciute. Non è stata inventata una tariffa cash/carta né presunta l’idoneità al transponder.

## Comportamento

- Stato di caricamento visibile e annunciato con `role=status` / `aria-live`, pulsante disabilitato solo durante la richiesta o senza percorso.
- Timeout frontend **40 secondi**, comprensivo dell’invocazione e del trattamento della risposta. La promessa termina anche se il trasporto ignora AbortSignal; lo stato viene ripristinato in `finally`.
- Guard sincrona tramite riferimento alla richiesta: evita doppio click prima dell’aggiornamento React.
- Coalescenza delle richieste contemporanee per utente, mappa e riferimento completo del percorso. Un chiamante può annullarsi senza cancellare la richiesta di un altro; l’ultimo annulla il trasporto. Risultati tardivi o relativi a percorso/mappa cambiati non vengono applicati.
- Stima recente (<10 minuti): il pulsante resta attivo come **Mostra stima salvata** e conferma **nessuna nuova richiesta inviata**. Questa azione è stata verificata anche nel browser reale.
- Errore, timeout, indisponibilità tariffe, percorso compatibile e percorso alternativo hanno messaggi distinti e la possibilità di riprovare.
- Tariffe alternative standard visibili separatamente; tariffa singola condizionata visibile con condizione; più opzioni raccolte nei dettagli e non sommate automaticamente. Nessuna tariffa disponibile significa importo sconosciuto, mai zero inventato.
- Geoapify resta il percorso visualizzato, la fonte dei chilometri e del carburante. La funzione condivisa dei totali non è stata modificata; i pedaggi alternativi restano esclusi dal totale e dalla garanzia budget.

## File modificati

- `src/components/TripCostCard.tsx`: ciclo richiesta, riuso cache, stati e presentazione tariffe alternative.
- `src/services/hereRouting.ts`: invocazione con deadline/coalescenza, validazione risposta e messaggi sicuri.
- `src/services/tollRequests.ts`: controllo deadline e richieste condivise.
- `src/services/tollFeedback.ts`: presentazione degli importi senza alterare i totali.
- `src/services/tollRequests.test.ts`, `src/services/hereRouting.test.ts`: verifiche mirate.

Nessun cambiamento a `supabase/functions`, migrazioni SQL o servizi di autenticazione. **Nessun deployment necessario** per questa correzione: basta la versione frontend aggiornata.

## Verifiche

Typecheck frontend/Edge e build PWA riusciti. Suite completa: **149 test passati in 12 file**. Nuovi test: timeout con trasporto che non termina, retry dopo errore/timeout, coalescenza e separazione tra utenti/mappe, cancellazione e risposte tardive, scope modificato, JSON malformato, zero vs sconosciuto, deduplicazione delle tariffe alternative, prezzo condizionato e totale Geoapify invariato. I casi di errore/timeout sono riprodotti con fixture e timer controllati; la prova reale sopra ha verificato successo alternativo, tariffa e riuso cache.

Screenshot del risultato reale: `docs/tolls-alternative-result.png`. Nessuna chiave o credenziale stampata; nessun log aggiunto. I normali contatori/cache della funzione esistente possono essere aggiornati dalla richiesta di prova, come in un normale uso del pulsante; nessun intervento manuale sul database.

Dopo il riavvio, aprire http://127.0.0.1:5173/ e verificare Stima pedaggi sulla propria bozza. Nessun bisogno di modificare HERE_API_KEY, ATLAS_ALLOWED_ORIGINS o configurazione JWT.
