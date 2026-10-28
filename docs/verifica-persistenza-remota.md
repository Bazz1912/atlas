# ATLAS — Verifica persistenza remota

26 ottobre 2026. Nessuna creazione, modifica o cancellazione di dati remoti; nessuna migrazione rieseguita, nessuna policy modificata. Nessuna credenziale nel rapporto.

## Riscontri sul servizio reale

Eseguite richieste GET a zero righe, senza sessione utente, per tutte le 11 tabelle: `atlas_profiles`, `atlas_maps`, `atlas_map_members`, `atlas_experiences`, `atlas_categories`, `atlas_visits`, `atlas_reviews`, `atlas_trips`, `atlas_connection_requests`, `atlas_connections`, `atlas_imports`.

Tutte rispondono HTTP 401 / codice 42501, nessuna PGRST205. Le tabelle sono riconosciute dall’API e l’accesso anonimo è negato. Questo prova il blocco anonimo, non da solo l’isolamento RLS tra due utenti autenticati.

L’utente ha effettuato il login in Chrome. Chrome non è disponibile al browser connector di questa sessione; l’anteprima Codex è disconnessa. Non sono stati estratti token dal browser o richieste password. Di conseguenza non è stata eseguita una lettura autenticata indipendente dei record personali o un upload reale.

## Collegamenti verificati nel codice

| Funzione | Percorso effettivo | Stato verificato / limite |
|---|---|---|
| Profilo | `atlas_profiles`, filtro UID della sessione | GET remoto prima di montare l’app; record personale non ispezionato da questa sessione |
| Mappa personale | `atlas_maps`, `atlas_map_members`, UID Auth; trigger onboarding | Il Gate richiede profilo, mappa e membri remoti. Associazione specifica da confermare con sessione Chrome o controllo SQL |
| Esperienze | RPC `atlas_save_experience`, GET `atlas_experiences` filtrata per map_id | Scrittura attesa prima di aggiornare la UI; nessun test di scrittura remoto effettuato |
| Categorie | GET/upsert `atlas_categories`; RPC per riassegnazione/eliminazione | Persistenza cloud predisposta e tabella remota presente. Le categorie predefinite mostrate durante il caricamento non sono prova di salvataggio |
| Visite e recensioni | `atlas_save_review` oppure bundle `atlas_save_experience`, tabelle `atlas_visits`/`atlas_reviews` | Transazione server e autore Auth; rating personale separato. Test SQL locali riusciti, scritture reali ancora da collaudare |
| Itinerari salvati | `atlas_save_trip`, GET `atlas_trips` per map_id | Cloud per i viaggi salvati; bozza non salvata in memoria |
| Ricerca username | RPC `atlas_search_users` con debounce/limiti | Ricerca server, non elenco locale; risultato reale non verificato senza sessione |
| Richieste/connessioni | RPC `atlas_send_request`, `atlas_respond_request`, GET richieste | Collegamento backend reale; non inviata alcuna richiesta di prova |
| Mappe condivise | RPC atomica di accettazione + maps/members/connections | Funzione SQL verificata localmente; prova reale con due account non eseguita |
| Foto esperienze | upload bucket `atlas-images`, percorso mapId/userId/file; DB image_path; URL firmato 15 minuti | Il blob locale è solo anteprima. Ricaricamento dal bucket; nessun upload reale o verifica autenticata del bucket effettuati |
| Avatar | upload privato `atlas-avatars`, percorso nel profilo, URL firmato | Stesso limite: da collaudare con upload e lettura autenticati |
| Aggiornamenti | Realtime + polling/focus ogni 30 secondi | Subscription predisposte; consegna Realtime effettiva da verificare con due sessioni |

L’app imposta `mode='cloud'` e `enforceAccounts()`. Gli adapter di archivio instradano categorie, esperienze, recensioni, visite e viaggi sul backend nel contesto autenticato. In assenza del contesto lanciano un errore: non ripiegano silenziosamente sul vecchio IndexedDB.

LocalStorage contiene preferenze (per esempio filtro mappa) e la sessione gestita dall’SDK Supabase; non è il database delle esperienze attuali. IndexedDB rimane per il vecchio archivio e l’import esplicito. Casa e bozza viaggio sono in memoria nella sessione, non sincronizzate finché il viaggio non viene salvato. Explorer filtra sul dispositivo i record caricati dalla mappa remota; non implica una chiamata OpenAI.

## Sicurezza e verifiche locali

Typecheck superato; 45 test superati in 6 file. Anche lo script di conteggio di sola lettura è stato eseguito su PostgreSQL locale di test, senza esecuzione sul database remoto.

Test PostgreSQL PGlite con ruoli e UID isolati: proprietario della mappa personale legge dati reali di fixture, due altri utenti non leggono mappa/membri/categorie/esperienze/visite/recensioni/itinerari neppure conoscendo gli ID, non inseriscono esperienze e non eliminano quelle private. Sono inoltre coperti RLS su mappe condivise, autori delle recensioni, membership arbitrarie, Storage e importazioni. Non è una certificazione delle policy effettivamente presenti sul servizio remoto.

## Verifica autenticata senza creare dati di prova

Nel Chrome dove sei già autenticato:

1. Ricarica ATLAS e controlla Profilo, selettore mappe e salvati. Dati caricati dal Gate e dagli adapter cloud; gli errori non vanno ignorati.
2. Se hai già creato esperienze/recensioni/categorie/viaggi, controllale nel Table Editor Supabase e poi ricarica l’app. Non cancellare il localStorage: contiene anche la sessione.
3. Per una conferma sui record usa facoltativamente `supabase/checks/verify_account_persistence.sql`: sostituisci NULL nella CTE input con il tuo UUID, non con password/chiavi, ed esegui manualmente nel SQL Editor. Mostra solo presenza e conteggi, oltre ai bucket privati. Non modifica nulla e non sostituisce il test RLS con JWT.
4. Per la mappa personale sono attesi una mappa, una membership owner e zero altri membri. Le categorie iniziali sono nove se non modificate. Zero esperienze/visite/recensioni/viaggi è corretto se non li hai ancora creati.
5. Per completare un test di scrittura, creare esplicitamente un’esperienza con foto e recensione richiederebbe nuovi dati: non è stato fatto automaticamente. Allo stesso modo, richieste e accettazione richiedono una seconda persona/account e cambiano dati.

Per Storage non servono nuove chiavi o un provider esterno: servono i bucket privati e le policy della migrazione già applicata. Se upload/lettura falliscono, verificare `atlas-images` e `atlas-avatars` e le policy corrispondenti; non rendere pubblici i bucket né aggiungere RLS permissive per aggirare l’errore.

Geoapify, AI OpenAI, routing e meteo esterni rimangono servizi separati da configurare e collaudare; non sono necessari per la persistenza Supabase.
