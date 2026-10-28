# Verifica ATLAS V2 — 23 ottobre 2026

## Controlli eseguiti

- **13 test superati**: unitari e IndexedDB in database di test isolato per filtri, ordinamento, validazione coordinate/stati, contratto rating e persistenza.
- Build TypeScript + Vite e generazione PWA (manifest, service worker, icone).
- Browser responsive a **390 × 844**: mappa reale OpenFreeMap visualizzata, barra ricerca, segmenti, tab inferiori, FAB e modulo a tutta altezza.
- Layout a **320 × 568**: nessun overflow orizzontale, quattro pulsanti di navigazione alti 59 px. Desktop a 1280 × 720: rail, pannello luoghi e mappa.
- Browser di collaudo su origine separata `127.0.0.1:4173`: creazione TO_DO con posizione scelta dalla mappa, conservazione campi durante selezione, categoria, note, salvataggio e riapertura dettaglio.
- Apertura dettaglio toccando il pin reale, espansione dello sheet tramite trascinamento della maniglia e passaggio TO_DO → DONE.
- Modifica di un DONE con caricamento di un PNG del progetto: anteprima, conversione JPEG e salvataggio; DONE resta DONE.
- Reload e riapertura da Salvati: esperienza, note, stato e foto JPEG persistono in IndexedDB.
- Build con base `/atlas/`: percorsi asset e manifest, scope/start URL, icone PNG e generazione worker verificati. Questa verifica locale non equivale al deploy remoto.

Le esperienze di prova hanno titoli espliciti `TEST UI` e non sono state inserite nell’archivio dell’anteprima principale su porta 5173. Non sono dati seed né esempi caricati dall’app.

## Limiti

Nessun dispositivo iPhone/Android fisico è stato collegato. L’emulazione dimensionale non certifica la tastiera Safari, l’home indicator, l’installazione standalone o le gesture native del sistema.

Senza progetto e credenziali esterne non sono stati testati contro servizi reali: migrazione PostgreSQL/RLS, identità Supabase, condivisione tra due persone, upload Storage e Geoapify autocomplete. Il codice di questi adattatori non equivale a servizi già attivi.

Journal completo, recensioni individuali, routing e AI non sono implementati. I test sul contratto rating preparano i vincoli della fase successiva, senza certificare un flusso di recensioni operativo. Nessun test AI o routing reale viene dichiarato superato.

GitHub non è stato collegato e il workflow Pages non è stato eseguito da remoto.

![Anteprima del layout iPhone senza dati di esempio](atlas-mobile.jpg)
