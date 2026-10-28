# Dati locali, revisione 0.3

## Aggiornamento automatico da 0.2

Il database mantiene il nome `atlas-v2`. La versione IndexedDB passa da 1 a 2, in una transazione di upgrade: non vengono cancellati né ricreati i record delle esperienze. Titoli, ID, coordinate e fotografie originali restano invariati. Se altre schede bloccano l’upgrade l’app chiede di chiuderle; non azzera i dati.

Gli identificatori storici delle categorie (`Food`, `Nature`, ecc.) diventano gli ID delle categorie predefinite con etichette italiane. Ogni esperienza mantiene anche il vecchio campo `category`, usato come alias di `categoryId` durante questa revisione. La traduzione non modifica le relazioni. Le nuove categorie hanno UUID e slug indipendenti dal nome. Rinominare una categoria non cambia gli ID.

L’ambiente dei dati precedenti diventa `MIXED`, una scelta neutra modificabile: non è una verifica delle condizioni del luogo. Non vengono inventate visite o recensioni per le vecchie esperienze DONE.

## Nuovi archivi

- `categories`: nomi, icone, colori e ID.
- `experiences`: luoghi, fotografie compresse in data URL e `deletedAt` per eliminazione logica.
- `visits`: data della visita e autore.
- `reviews`: voto nullable, note, autore, riferimento alla visita e al luogo.
- `trips`: viaggi con tappe ordinate per ID e durata delle soste.
- `meta`: identità locale stabile, eventuale Casa privata e bozza del viaggio corrente.

Ogni recensione appartiene all’ID dell’autore, non al nome visualizzato. L’app usa la tua identità locale; non offre un selettore per impersonare un’altra persona. È già possibile conservare più visite dello stesso luogo: riporta il luogo in Da fare e completa nuovamente la visita. Modificare un ricordo esistente aggiorna la tua ultima recensione; non elimina quelle precedenti.

## Eliminazione e referenze

La conferma mostra il titolo dell’esperienza. L’eliminazione imposta `deletedAt`, esclude il record dalla mappa, dalla lista e dalla ricerca guidata, conservando foto, visite e recensioni nel backup. Le tappe salvate mantengono gli ID: la UI indica “Luogo eliminato dall’archivio” e chiede di rimuoverle prima del nuovo salvataggio del viaggio. Non vengono restituiti percorsi con tappe mancanti.

La cancellazione di una categoria richiede una categoria sostitutiva. La riassegnazione dei record, inclusi gli eliminati, e la rimozione della categoria avvengono nella stessa transazione. Le esperienze non vengono cancellate.

Non è presente uno svuotamento irreversibile dell’archivio eliminati. Il ripristino e l’import da backup richiederanno un flusso dedicato; conserva il JSON prima di interventi sul browser.

## Backup ora disponibile

Impostazioni → Esporta backup JSON produce il formato `version: 2` con tutte le categorie, esperienze (anche eliminate), foto locali, visite, recensioni, viaggi e metadati. Conserva il file come dato privato: può contenere Casa e fotografie. Il backup non sincronizza i dispositivi e non viene caricato su servizi esterni.

I dati sono legati all’origine completa del browser, inclusa la porta: `127.0.0.1:5173`, `localhost:5173` e il futuro dominio Pages hanno archivi separati. Cancellare dati del browser o cambiare dispositivo può far perdere l’accesso. Il backup è essenziale prima di cambiare origine. Non cancellare l’archivio locale quando collegherai Supabase.

## Strategia di migrazione verso Supabase

Le interfacce in `services/contracts.ts` separano UI e persistenza. `experienceRepository`, `categoryRepository`, `reviewRepository` e `tripRepository` sono gli adapter locali operativi. Il vecchio adapter cloud delle sole esperienze rimane nel codice, ma rifiuta scritture dei nuovi campi per evitare sincronizzazioni parziali: **la sincronizzazione completa 0.3 non è ancora implementata**. Non attivarla finché non è pronto un adapter con transazioni/RPC per tutte le entità.

Lo SQL `202610230002_categories_trips.sql` prepara categorie per spazio, FK, ambiente, eliminazione logica, viaggi/tappe, Casa privata e RLS. Richiede la prima migrazione. È uno schema da collaudare su un progetto di staging: non è stato eseguito su un database reale. Gli spazi creati dopo la migrazione dovranno ricevere le nove categorie predefinite in fase di provisioning.

Il futuro import deve svolgere queste operazioni, senza cancellare la fonte locale:

1. Esportare e conservare il JSON completo; validare versione, campi, rating, riferimenti e dimensioni fotografie in un’anteprima di import.
2. Autenticare esplicitamente l’utente Supabase e verificarne la membership dello spazio di destinazione. Il locale `authorId` non è un UID Supabase: creare una mappa esplicita per gli autori, con conferma dell’associazione, senza attribuire automaticamente recensioni di altri utenti.
3. Importare categorie mantenendo gli ID e gestendo conflitti di nome/slug con una tabella di corrispondenza, mai con cancellazioni.
4. Importare le esperienze mantenendo gli UUID e convertendo `categoryId` nel campo SQL `category_id`; non usare il nome italiano come chiave.
5. Decodificare le foto locali e caricarle nel bucket privato con i percorsi autorizzati, poi registrare `primary_image_path`. Non memorizzare data URL o URL firmati temporanei come percorso Storage.
6. Importare visite e recensioni nell’ordine delle FK, conservando UUID e autore mappato, rating NULL/0 e storico.
7. Importare viaggi e tappe normalizzate, preservando ordine e soste. I luoghi archiviati restano tombstone; nessun percorso viene dichiarato valido fino alla verifica delle tappe attive.
8. Usare un job di import idempotente (chiave origine + ID locale), RPC transazionali per i record e un registro degli upload per ripresa/rollback. Le policy ordinarie non permettono di attribuire autori arbitrari: eventuali import multi-autore richiedono una procedura backend verificata, mai una service-role key nel browser.
9. Confrontare conteggi, relazioni, foto e campioni di recensioni; provare un secondo dispositivo. Passare allo spazio condiviso solo dopo un riepilogo verificato. Conservare JSON e archivio locale fino al completamento dei controlli.

Questa procedura è il piano documentato per l’import, non un pulsante di migrazione già operativo. Non sono necessari account o chiavi per usare le funzioni locali attuali.
