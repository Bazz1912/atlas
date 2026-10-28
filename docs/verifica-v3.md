# Verifica ATLAS 0.3 — 23 ottobre 2026

## Eseguito

- `npm run typecheck`: superato.
- `npm test`: **24 test superati, 4 file**.
- `npm run build`: compilazione TypeScript/Vite e generazione PWA riuscite.
- Build con base `/atlas/`: verificati percorsi asset, manifest, scope/start URL, icone e service worker; poi ripristinata build alla radice.
- HTTP del server di sviluppo su `127.0.0.1:5173`: 200 OK.

I test automatici coprono migrazione IndexedDB v1→v2 senza perdita di ID/foto, etichette italiane su ID storici, creazione/rinomina/eliminazione categorie con riassegnazione, creazione TO_DO/DONE, recensioni per autore e storico, voto zero/null/mezze stelle, rifiuto di dati invalidi, ricerca deterministica, tappe condivise senza duplicati e cancellazione logica con referenze conservate.

Le condizioni meteorologiche avverse sono testate con fixture unitarie dichiarate, non con previsioni reali. L’adapter runtime non configurato restituisce indisponibilità.

## Collaudo browser mobile

Viewport **390 × 844**. Dati di collaudo esplicitamente denominati `TEST` nell’origine separata `127.0.0.1:4174`, senza introdurli nell’archivio principale:

1. Gestione categorie aperta dal modulo esperienza, creazione categoria con nome e icona Caffè, immediata disponibilità nel menu del modulo.
2. Creazione diretta Già fatto con categoria personale, ambiente Al chiuso, foto PNG del progetto compressa in JPEG, voto 4,5 e note personali.
3. Scelta del punto sulla mappa senza perdere i campi del modulo; il nome manuale è dichiarato non verificato.
4. Scheda dettagliata con foto, categoria italiana, ambiente, voto 4,5 e note dell’autore locale.
5. Marker circolare con la foto corretta, bordo turchese e check; apertura del dettaglio tramite il marker.
6. AI Explorer: risultato basato sul luogo realmente salvato, indicazione Meteo non disponibile e trasferimento a Viaggi.
7. Viaggi: modifica del nome e della sosta da 60 a 90 minuti, salvataggio, ritorno ad AI Explorer con contesto ed esclusione della tappa già presente (nessun risultato compatibile).
8. Eliminazione esperienza: conferma con titolo, scomparsa del marker e del luogo attivo, viaggio con referenza esplicitamente segnalata come eliminata.
9. Reload: viaggio, nome, sosta da 90 minuti e segnalazione della tappa eliminata conservati.

Sull’origine principale è stato aperto e poi chiuso un modulo **senza salvarlo** per verificare le stelle cliccabili della versione finale: tocco sulla quinta stella → 5, tocco sulla sua metà sinistra → 4,5, “Assegna 0” → 0, “Nessun voto” → Non assegnata. Nessuna esperienza di test è stata salvata sull’origine principale.

La mappa finale utilizza la nuova palette; il controllo console della schermata principale non ha restituito errori o avvisi.

Verificati anche il layout compatto a **320 × 568** (larghezza contenuto 320 px, senza overflow orizzontale) e il breakpoint desktop a **1280 × 800**, con rail laterale, lista luoghi e mappa. Gli override delle dimensioni del browser sono stati rimossi al termine.

## Non certificato

Non sono stati collegati account o API. Restano da collaudare su servizi reali PostgreSQL/RLS/Storage e import Supabase, Geoapify, routing, meteo e backend OpenAI. Non sono stati eseguiti deploy remoti né modifiche alle configurazioni GitHub. Nessun iPhone/Android fisico era collegato: safe area, tastiera e installazione PWA richiedono ancora test su hardware reale.

## Immagini dell’interfaccia finale

![Mappa mobile](atlas-pop-mobile.jpg)

![Recensione mobile, modulo non salvato](atlas-recensione-mobile.jpg)
