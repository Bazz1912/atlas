# ATLAS — Luoghi, ricordi e viaggi

Revisione del progetto esistente React + Vite + TypeScript, senza ricrearlo. Mappa MapLibre/OpenFreeMap reale, navigazione mobile a quattro sezioni e sidebar desktop conservate. Interfaccia light lifestyle: crema e bianco, corallo per le azioni, lavanda per Explorer e menta per Viaggi. Font DM Sans incluso localmente. Nessuna landing page o dataset dimostrativo viene caricato nell’app.

## Avvio

```sh
cd /Users/marketing3/Desktop/ATLAS
./npm-local.sh run dev
```

Apri **http://127.0.0.1:5173/**. Node 24 e npm sono già disponibili nella copia locale `.tools/node/`. Su un altro computer installa Node 24 LTS e usa `npm ci`. Lo script locale tiene anche la cache npm nel progetto.

```sh
./npm-local.sh run typecheck
./npm-local.sh test
./npm-local.sh run build
./npm-local.sh run preview -- --port 4173 --strictPort
```

La preview della build è `http://127.0.0.1:4173/`. Le porte hanno archivi separati. Service worker/installazione sono disponibili nella build di produzione, non in dev. Per installare su iPhone o Android serve un URL HTTPS (oppure localhost sullo stesso dispositivo). Su iPhone: Safari → Condividi → Aggiungi alla schermata Home. Il collaudo responsive non sostituisce quello su hardware.

## Funzioni già operative senza account o API

- **Categorie italiane** con ID stabili: Cibo, Esperienze, Passeggiate, Natura, Cultura, Viaggi, Shopping, Vita notturna, Altro. Gli ID storici non cambiano con la traduzione.
- **Categorie personali**: crea, rinomina, scegli icona e colore. Gestione da Impostazioni o dal modulo esperienza. Compaiono subito in moduli, filtri e AI Explorer. L’eliminazione richiede conferma e una categoria sostitutiva per conservare i luoghi.
- **Esperienze Da fare / Già fatto**: titolo, descrizione, categoria, foto, coordinate reali selezionate sulla mappa, priorità per Da fare e ambiente indipendente (Al chiuso, All’aperto, Misto).
- **Recensioni** già durante l’aggiunta di un Già fatto: data facoltativa, voto da 0 a 5 a mezze stelle, note personali. Stelle cliccabili e slider touch. NULL e voto 0 restano distinti.
- **Completamento**: “Segna come fatto” apre il modulo di recensione prima di salvare. “Voglio tornarci” conserva lo storico. Il dettaglio mostra le recensioni per autore; non esiste un voto globale che sovrascrive le persone.
- **Pin fotografici**: la tua foto ritagliata in un cerchio; senza foto, icona della categoria. Bordo verde/giallo/rosso per priorità, lavanda con check per Già fatto. Pulsanti accessibili da 50 px e clustering MapLibre.
- **Eliminazione esperienze**: conferma con titolo, eliminazione logica e rimozione immediata da mappa, lista e ricerca. Le referenze dei viaggi rimangono segnalate come eliminate, con richiesta di rimozione prima di un nuovo salvataggio.
- **AI Explorer guidato locale**: filtra i luoghi effettivi per categorie, stato, priorità, ambiente e ultima tua valutazione dei Già fatto. Mostra nessun risultato se i filtri non trovano corrispondenze. Non chiama OpenAI.
- **AI Explorer ↔ Viaggi**: seleziona una proposta, aprila in Viaggi, modifica l’ordine, rimuovi/aggiungi tappe, imposta soste e partenza, salva e riapri. La funzione inversa cerca tappe aggiuntive escludendo quelle già nel viaggio.
- **Partenza**: luogo salvato, ricerca indirizzo (se Geoapify configurato), posizione attuale con permesso, Casa solo se salvata esplicitamente. Casa non viene dedotta dal GPS.
- **Persistenza**: IndexedDB per esperienze/foto, categorie, visite, recensioni, viaggi e bozza corrente. Backup JSON completo da Impostazioni.

La ricerca guidata produce una selezione ordinata di luoghi, non un percorso stradale ottimizzato. I limiti in minuti sono conservati e chiaramente indicati come non verificati. Data e preferenze libere non dimostrano disponibilità, apertura o compatibilità meteorologica.

## Cosa richiede ancora servizi esterni

| Funzione | Stato reale |
| --- | --- |
| Cartografia | OpenFreeMap già utilizzato senza chiave; rete e WebGL necessari |
| Ricerca indirizzi | Adapter Geoapify presente; serve chiave con restrizioni per dominio e quote |
| Sincronizzazione condivisa | Nuovo schema Supabase predisposto; adapter completo, import e collaudo RLS ancora necessari |
| Linguaggio naturale | Non attivo. Serve OpenAI attraverso Supabase Edge Functions, con chiave esclusivamente backend |
| Distanze e guida | RoutingService predisposto, non configurato; nessuna stima inventata |
| Meteo | WeatherService astratto; “Meteo non disponibile”. Nessuna previsione casuale o chiamata meteo |

I dettagli dei contratti, dei limiti e del candidato Open-Meteo sono in [servizi esterni](docs/servizi-esterni.md). Nessun account è stato configurato, nessun segreto inserito e nessuna API a pagamento attivata.

## Dati esistenti e migrazione

L’upgrade locale da IndexedDB versione 1 a 2 avviene automaticamente, conservando ID, luoghi e fotografie. Non crea recensioni per i vecchi DONE. Ambiente iniziale dei vecchi luoghi: Misto, modificabile. Se l’upgrade è bloccato, chiudi le altre schede ATLAS e ricarica.

**Non cancellare i dati del browser.** I dati non sono sincronizzati tra dispositivi e appartengono alla singola origine, inclusa la porta. Esporta JSON prima di cambiare dominio o browser. Il sistema resta provvisorio; il ripristino JSON/import cloud non è ancora un flusso disponibile nell’interfaccia.

La strategia per non perdere categorie, foto, recensioni e viaggi quando verrà collegato Supabase è descritta in [migrazione-v3](docs/migrazione-v3.md). Prevede backup, associazione esplicita delle identità, conservazione degli UUID, upload privato delle fotografie e import idempotente verificato. Il vecchio adapter cloud non viene usato per trasferire parzialmente i nuovi dati.

## Architettura

`src/domain.ts` contiene modelli comuni; `services/contracts.ts` espone ExperienceRepository, CategoryRepository, ReviewRepository, TripRepository, AiExplorerService, RoutingService e WeatherService. La persistenza locale è separata in `localStore.ts` e `archive.ts`. Le viste Explorer e Trips condividono `Trip` e il relativo stato; non duplicano un itinerario indipendente.

Le recensioni sono legate a `authorId`, le visite a `experienceId`, le tappe a `experienceId`, le categorie a ID immutabili. Il display name non identifica una persona. La tua identità locale è conservata in IndexedDB, senza un selettore che permetta di impersonare un’altra persona.

## Configurazione futura

1. **Geoapify**: copia `.env.example` in `.env.local`, configura `VITE_GEOAPIFY_KEY` pubblica con domini/quote limitati e riavvia Vite. L’autocomplete richiede selezione di un risultato reale. Senza chiave puoi sempre scegliere la posizione sulla mappa.
2. **Supabase**: crea un progetto di staging, applica nell’ordine le due migrazioni in `supabase/migrations`, verifica RLS, bucket privato e membership. La seconda migrazione prepara categorie, ambiente, eliminazione logica, viaggi/tappe e Casa privata. Nessuno SQL è stato eseguito da questa sessione. Realizza e testa gli adapter completi e l’import prima di attivare la sincronizzazione.
3. **Identità condivise**: abilita Auth e un sistema di recupero (per esempio magic link) prima di promettere accesso stabile su più dispositivi. Le identità locali e gli UID Supabase richiedono una mappatura esplicita durante l’import.
4. **Routing**: collega l’adapter a un servizio stradale reale; verifica tappe, errori e destinazioni irraggiungibili. Non confondere la somma delle soste con la durata del viaggio.
5. **Meteo**: attiva un provider dopo verifica delle condizioni d’uso; usa coordinate, data, ora e fuso della destinazione, controlla orizzonte previsionale, cache e limiti. I componenti sono predisposti per aggiornare e invalidare il meteo quando cambia la richiesta.
6. **OpenAI**: implementa e pubblica separatamente una Supabase Edge Function con verifica JWT/membership, limiti di utilizzo e schema validato. Salva OPENAI_API_KEY soltanto nei Secrets backend, mai in VITE, bundle, localStorage o GitHub Variables frontend.

## PWA e GitHub Pages

Il manifest, le icone, lo standalone, le safe area e il service worker con aggiornamento su richiesta sono conservati. I percorsi restano compatibili con `VITE_BASE_PATH=/<repository>/`; nessun routing server-side. Il workflow GitHub esistente non è stato modificato, eseguito o collegato a un account.

Per una futura pubblicazione usa la configurazione Pages già preparata e pubblica `dist` solo dopo test e autorizzazione. Pages non pubblica Supabase Edge Functions e non sincronizza gli archivi locali. Le configurazioni VITE sono pubbliche; nessuna chiave segreta deve finire nel repository.

## Verifiche

Il registro del redesign chiaro si trova in [verifica light](docs/verifica-light.md); quello funzionale precedente in [verifica 0.3](docs/verifica-v3.md). Le fixture dei test restano isolate e non sono importate nell’app.

Prima dell’attivazione dei servizi restano necessari test reali di SQL/RLS, Storage, import, geocoding, routing, meteo e backend AI. Anche installazione e tastiera iOS/Android richiedono collaudo su dispositivi fisici. Nessun test dipendente da API è dichiarato superato senza essere stato eseguito.

## Design system light

Palette, ombre e raggi sono centralizzati in `src/design/tokens.json`. Dopo una modifica esegui `npm run theme` per rigenerare `src/styles/tokens.css`; `scripts/generate-icons.py` rigenera le icone PWA. `lifestyle.css` definisce le nuove card fotografiche, i fogli mobili, i controlli e le timeline. Il CSS precedente usa gli stessi token chiari. La mappa usa lo stile Liberty dello stesso OpenFreeMap con colori giorno e nomi italiani quando disponibili. I colori di priorità e quelli personali già salvati sono conservati. Nessuna migrazione dati richiesta dal redesign.
