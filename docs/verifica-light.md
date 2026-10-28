# ATLAS — Verifica redesign light

24 ottobre 2026. Revisione visiva dell’app esistente; nessuna migrazione del database e nessuna nuova API.

## Controlli eseguiti

- Typecheck TypeScript riuscito; 24 test superati in 4 file (dominio, archivio, repository e migrazione preesistente).
- Build Vite/PWA riuscita, anche con `VITE_BASE_PATH=/atlas/`. Manifest, scope, icone, HTML, asset e font puntano al sottopercorso corretto. Ripristinata poi build con base `/`.
- Mappa MapLibre reale OpenFreeMap Liberty, tema giorno e nomi italiani quando presenti. Nessuna immagine usata al posto della cartografia. Provider invariato.
- Ispezione browser a 390 × 844 e 1440 × 900: navigazione, form, filtri, dettaglio espandibile, lista fotografica, Explorer e Viaggi. Nessun overflow orizzontale nei layout ispezionati; nessun warning/errore nella console della preview desktop.
- Preview isolata sulla porta 4175: creata esperienza `TEST LIGHT — Un ricordo`, foto locale di prova, posizione manuale, voto 4,5 e nota. Verificati salvataggio e riapertura del dettaglio, espansione, card in Salvati, pin fotografico con bordo lavanda/check e recensione. Corretta una foto che superava l’altezza della card coprendo il testo.
- Ricerca guidata dei luoghi effettivamente salvati, passaggio a Viaggi, timeline e salvataggio di `TEST LIGHT — Viaggio` verificati sulla stessa origine di prova. Nessuna fixture aggiunta all’origine principale 5173.
- Aggiornamento PWA su richiesta verificato nella preview, conservando l’esperienza di prova.
- Audit dei colori: nessuna superficie navy o gradiente notturno nel CSS applicativo. Colori personali delle categorie e verde/giallo/rosso delle priorità conservati. Token condivisi da CSS, cartografia e manifest; font incluso nel bundle.
- Contrasti calcolati per i ruoli principali: testo/bianco 13,46:1; secondario/bianco 4,72:1; secondario/crema 4,52:1; testo/corallo 6,03:1. Testi dedicati su corallo/lavanda/menta/giallo tenui ≥ 5,9:1. Focus visibile, pulsanti principali da almeno 44 px e regola reduced-motion presenti; nessuna certificazione WCAG completa dichiarata.

## Evidenze

- `atlas-light-mobile.jpg`: mappa principale a 390 × 844, nessun luogo dimostrativo.
- `atlas-light-desktop.jpg`: mappa e sidebar principali.
- `atlas-light-form.jpg`: modulo mobile.
- `atlas-light-collection-test.jpg` e `atlas-light-trip-test.jpg`: archivio isolato, contenuti marcati TEST.

## Limiti

Installazione, safe area e tastiera su iPhone/Android fisici non collaudate. La mappa richiede rete e WebGL; il service worker conserva la shell, non promette cartografia offline. Meteo, routing e AI esterna non configurati: messaggi e limiti reali rimangono visibili. Nessun servizio cloud attivato, nessuna chiave inserita, nessuna pubblicazione effettuata.
