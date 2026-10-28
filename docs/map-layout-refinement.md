# ATLAS · revisione del layout mappa

Intervento limitato a markup, stile e comportamento del viewport della tendina. Nessuna modifica a servizi, query, credenziali, dati, migrazioni o policy. Nessun intervento nei componenti AI Explorer, Viaggi o nelle logiche di autenticazione e condivisione.

## File

- Nuovo `src/components/MapTopBar.tsx`: riga unica con logo, selettore nativo e avatar iniziale da 44 px. Riceve le azioni esistenti, senza accesso ai repository.
- `src/account/AccountGate.tsx`: solo import e presentazione di `MapSelector`, delegata alla top bar; restano gli stessi `select` e `open`. Nessuna modifica a sessioni, profili o caricamento dati.
- `src/App.tsx`: eliminati realmente dal markup chip Personale/Condivisa e riquadro del numero luoghi; rimossa la seconda riga del logo. Le altre entrate delle impostazioni restano presenti.
- `src/account/account.css`: rimossa la regola che faceva scorrere e ritagliava l’intero HUD.
- `src/components/PlaceSearch.tsx`: aggiunti soltanto un riferimento al pannello e la misura del visual viewport per la sua altezza. Debounce, query, risultati, callback e selezione restano invariati.
- Nuovo `src/styles/map-layout.css`: layout compatto, safe area, nome mappa lungo con ellissi, touch target, layering e scroll indipendente. Caricato per ultimo da `src/main.tsx`.

## Ricerca

Il pannello rimane assoluto sotto la barra, fuori dal flusso: aprirlo non sposta filtri/header. L’HUD ha `overflow: visible` e non scorre. Solo la lista ha `overflow-y: auto`, `overscroll-behavior-y: contain`, `touch-action: pan-y` e scorrimento touch WebKit. I livelli visivi consentono alla lista di passare sopra filtri e controlli della mappa.

Altezza massima: fino al 55% del viewport visibile, limitata anche dallo spazio disponibile sopra la navigazione inferiore. La misura segue `visualViewport.resize/scroll` e il resize della finestra; non cambia lo stato applicativo. Input e selettore a 16 px evitano lo zoom di focus su iPhone. Le safe area superiori e laterali usano le variabili/env già previste dall’app.

Chip e riquadro conteggio non sono nascosti via CSS: non vengono più renderizzati. La legenda esistente è avvicinata alla navigazione mobile senza inserire un nuovo riepilogo. La lista laterale desktop viene rialzata insieme all’header, con spazio aggiuntivo quando ci sono filtri attivi.

## Verifiche

- Typecheck completo, 100 test esistenti e build PWA superati.
- Componenti reali verificati in un’anteprima isolata con MapLibre reale e senza dati/account caricati; nomi mappa dimostrativi dichiarati nell’anteprima. Nessun dato remoto modificato.
- 390 × 844: header 44 px; barra ricerca a 60 px senza safe area simulata. Nome mappa lungo contenuto nella riga, nessun overflow orizzontale.
- 320 × 568: lista risultati reale Geoapify limitata a circa 312 px; scroll interno verificato (64 px), body e HUD fermi a zero, ricerca sempre a 60 px. Nessuno scroll della pagina.
- Safe area superiore simulata di 47 px: header a 55 px e ricerca a 107 px, senza overflow orizzontale. La navigazione inferiore conserva le safe area già previste.
- Verifica desktop e viewport corto: controlli e pannello restano entro i limiti disponibili.

La tastiera e il notch fisici di iPhone/Android restano da confermare sui dispositivi reali. L’anteprima isolata viene eliminata dopo i controlli; le immagini di verifica restano in `docs/`. Il flusso account effettivo si prova nella sessione Chrome già autenticata dell’utente, ricaricando l’app.
