# ATLAS — Geoapify: indirizzi e itinerari in auto

26 ottobre 2026. Riutilizzati PlaceSearch, ExperienceForm, selezione manuale MapLibre, Trips, OriginPicker e il collegamento Explorer → Viaggi. Grafica mantenuta; autenticazione, condivisione e upload foto non modificati. Nessun account esterno creato, nessuna chiave inventata, nessuna chiamata di prova con dati personali e nessuna modifica al database remoto.

## Verifica reale della connessione — 26 ottobre 2026

Dopo l’inserimento della chiave da parte dell’utente, server riavviato e configurazione caricata da Vite. Verificati dal browser su `http://127.0.0.1:5173/` due autocomplete di luoghi pubblici di Roma e un routing in auto tra le coordinate effettivamente restituite: autocomplete OK, routing OK, distanza/tempo/geometria presenti. Nessuna chiave mostrata nei log, nessun dato ATLAS salvato e nessun accesso al database durante questa prova. Anteprima principale aperta. Le verifiche complete di modifica/salvataggio esperienze e viaggi nel proprio account restano distinte da questo controllo di connessione.

## Configurazione della chiave

In `/Users/marketing3/Desktop/ATLAS/.env.local` la chiave è ora configurata. Per eventuali modifiche, il formato è:

```dotenv
VITE_GEOAPIFY_API_KEY=
```

Inserisci dopo `=` la tua vera chiave Geoapify browser. Conserva le altre variabili Supabase. Il nome precedente `VITE_GEOAPIFY_KEY` è sostituito da **VITE_GEOAPIFY_API_KEY** nel codice, nell’esempio e nel workflow Pages locale. Non servono nuove chiavi Supabase.

Nel progetto Geoapify verifica l’accesso a Address Autocomplete e Routing e le quote disponibili. Nelle restrizioni della chiave autorizza i soli domini/referrer usati, per esempio `http://127.0.0.1:5173/*` e, se lo usi, `http://localhost:5173/*`; aggiungi il dominio HTTPS pubblico quando pubblicherai. Imposta le Origins/CORS coerenti dove richieste dal dashboard, con schema e porta corretti. Il browser invia l’origine tramite referrer cross-origin. Non usare restrizioni IP server per una chiave che deve funzionare nei browser dei tuoi dispositivi. Non disabilitare globalmente le restrizioni per risolvere un errore 403.

La chiave VITE è pubblica nel bundle e nelle richieste del browser: le restrizioni e le quote vanno configurate in Geoapify. L’app non stampa la chiave o gli URL delle richieste nei log e non li salva nei viaggi. Se condividi screenshot di Network/URL con altri, oscura il parametro apiKey.

Riavvio manuale dal terminale (Ctrl+C sul server attuale):

```sh
cd /Users/marketing3/Desktop/ATLAS
./npm-local.sh run dev
```

Apri `http://127.0.0.1:5173/`. Per Pages, quando vorrai pubblicare, imposta anche la Repository Variable pubblica `VITE_GEOAPIFY_API_KEY` e ricompila. Nessun deploy è stato eseguito.

## Comportamento effettivo

### Indirizzi e correzione del pin

Autocomplete mondiale senza filtro per paese, italiano, minimo 3 caratteri, debounce 400 ms, massimo 5 risultati. Le risposte obsolete vengono annullate. Selezione touch/mouse o frecce + Invio; Invio nel campo di ricerca non invia il modulo esperienza. Non basta digitare un testo per generare una posizione.

Solo scegliendo un risultato vengono usati `lat`, `lon` e indirizzo restituiti da Geoapify. Le coordinate numeriche vengono conservate senza arrotondamento: l’arrotondamento riguarda soltanto le etichette a schermo. La precisione effettiva dipende dal risultato (un risultato città non è un numero civico).

Il comando “Correggi il punto sulla mappa” riapre la selezione centrata sul punto corrente, anche dopo una nuova ricerca in modifica. Tocca la mappa oppure spostala sotto il mirino e conferma. Il nome resta conservato; il punto corretto è marcato come selezione manuale. Non viene spacciato per indirizzo verificato da reverse geocoding.

Le coordinate passano nel salvataggio esperienza Supabase già esistente; non sono conservate soltanto in localStorage. Le foto non vengono toccate dalla correzione del pin.

### Viaggi e mappa

Aggiungi almeno due esperienze, oppure una partenza esplicita e una esperienza. Routing da 2 a 50 punti inclusa partenza, in auto, nell’ordine scelto. L’ordine non viene ottimizzato automaticamente. Luoghi eliminati, coordinate invalide o tutti i punti uguali producono un errore senza numeri fittizi.

“Calcola percorso in auto” chiama Routing API: distanza metrica, durata in secondi e geometria GeoJSON originale, anche MultiLineString. “Mostra percorso sulla mappa” visualizza quella geometria su MapLibre e adatta lo zoom; nessuna linea retta viene costruita come sostituto di un percorso stradale. Puoi nasconderla con il relativo controllo. Dove presenti si mostrano distanze e tempi dei singoli tratti.

Guida, soste e totale sono separati: il totale è la somma dei secondi di guida API e dei minuti di sosta inseriti dall’utente. Ogni sosta va da 0 a 1440 minuti. Tempi stimati in modalità free_flow, **non traffico live**, né prenotazioni o garanzie sull’orario di arrivo. Il piano non include automaticamente il ritorno alla partenza.

Se cambi coordinate, partenza, ordine o insieme delle tappe, il vecchio percorso non viene più mostrato come valido. Richieste in corso vengono annullate; un risultato obsoleto non sovrascrive il nuovo piano. Cambiare solo le soste aggiorna il totale senza richiamare inutilmente il servizio stradale. Un viaggio salvato conserva riepilogo, geometria, timestamp e firma dei punti; alla riapertura la firma viene confrontata con le coordinate attuali. Il risultato è un’istantanea, ricalcolabile, non un feed in tempo reale.

### AI Explorer

I filtri esistenti lavorano sempre sui luoghi della mappa selezionata. Le tappe scelte passano al medesimo editor Viaggi, dove calcoli il percorso completo.

Con Geoapify configurato e un limite di guida impostato, serve una partenza. La ricerca verifica con Routing API il tempo dalla partenza a ciascun candidato (al massimo 10 candidati; per numeri maggiori chiede di restringere i filtri). Il limite riguarda ciascun luogo, non il totale di più tappe: quel totale viene verificato in Viaggi. Un errore API non viene convertito in una falsa corrispondenza. Le chiamate consumano la quota Geoapify; senza limite impostato non parte il routing in Explorer.

Senza chiave, il limite rimane una preferenza esplicitamente non verificata. OpenAI e meteo non vengono simulati o attivati da questa integrazione.

## Database: nessuna migrazione necessaria

Il modello attuale ha già coordinate dell’esperienza e tappe/partenza/soste dei viaggi. `atlas_trips.data` è JSONB e accetta il nuovo `routeSummary` con geometria, metriche, modalità, fonte, timestamp e firma. La RPC `atlas_save_trip` già esistente conserva questo JSON; un test PostgreSQL locale lo ha verificato con lettura da parte dell’altro membro e diniego a un terzo.

Nessuna nuova tabella o colonna, nessuna modifica alle policy, nessuna migrazione da applicare o rieseguire. Vecchi viaggi con routeSummary nullo rimangono compatibili. Nessuna chiave o intero payload Geoapify con request parameters viene persistito.

## Test eseguiti

- Typecheck, suite automatica e build Vite/PWA.
- Nuovi test isolati con fetch simulato solo nei test: coordinate precise, ricerca mondiale, ordine lat/lon della richiesta e lon/lat del GeoJSON, unità metriche, geometria multi-tratto, partenza, soste, invalidazione dopo cambio pin/ordine, risposta vuota/malformed, chiave mancante, 401/403/429/500, rete, abort e timeout.
- Explorer: vincolo verificato usando la risposta API, origine obbligatoria, massimo candidati e messaggio senza chiave.
- Persistenza routeSummary nel JSON del database e isolamento fra membri tramite PostgreSQL locale, senza contattare Supabase remoto.
- Verifica browser 390 × 844 di PlaceSearch e Trips senza chiave, in pagina temporanea isolata con archivio vuoto. Nessun account aggirato, nessun luogo di esempio importato, nessun salvataggio. Console senza errori. Il relativo screenshot non rappresenta un percorso Geoapify già calcolato.

I controlli iniziali senza chiave riguardavano la fase di implementazione. La successiva prova API reale è riportata sopra. Non sono state modificate le funzionalità Supabase operative dell’utente.

## Test da eseguire con la chiave reale

1. In Chrome autenticato cerca indirizzi in Italia e all’estero; seleziona un risultato, salva un’esperienza, ricarica e verifica punto e indirizzo.
2. Modifica l’esperienza: scegli un altro risultato, poi correggi il punto manualmente. Verifica al ricaricamento coordinate aggiornate e fotografia invariata.
3. In Viaggi scegli due o tre esperienze raggiungibili in auto. Calcola, controlla guida/distanza/soste/totale, poi mostra la linea stradale sulla mappa.
4. Cambia ordine o sposta un pin: il vecchio percorso deve sparire finché non ricalcoli. Cambia solo una sosta: il totale deve cambiare senza inventare nuova guida.
5. Salva il viaggio, ricarica e riaprilo. Verifica lo stesso riepilogo e percorso; controlla anche dall’altro account membro della mappa condivisa.
6. In Explorer imposta partenza e limite di guida; verifica risultati entro il limite, poi passa le tappe in Viaggi e calcola il totale del piano.
7. Prova assenza rete, indirizzo senza risultati e punti non collegabili in auto; nessuna distanza o tempo casuale deve comparire. Controlla 403 con dominio non consentito e le quote dal dashboard Geoapify, senza pubblicare chiavi nei log.
8. Verifica su iPhone/Android e, dopo un futuro deploy, sul dominio Pages autorizzato. Non rieseguire migrazioni Supabase per questi test.

Documentazione ufficiale consultata: [Address Autocomplete](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/) e [Routing API](https://apidocs.geoapify.com/docs/routing/).
