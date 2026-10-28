# Integrazioni predisposte

Tutte le interfacce sono in `src/services/contracts.ts`. Nessun segreto è stato inserito e nessuna configurazione GitHub è stata modificata.

## AI Explorer

L’adapter attuale interroga deterministicamente i luoghi salvati: stato, categorie (incluse quelle personali), priorità, ambiente e ultima recensione dell’utente locale per i DONE. Con un filtro sul voto, i DONE privi del tuo voto sono esclusi; i TO_DO non ricevono voti fittizi. Lo 0 è un voto valido, NULL significa assente. Le preferenze testuali, data e limite di guida sono annotate ma non spacciate per vincoli verificati.

La proposta non è un percorso ottimizzato: la selezione mantiene l’ordine scelto dall’utente. Il pulsante “Apri in Viaggi” usa il modello Trip comune. In direzione inversa, “Suggeriscimi una tappa” mantiene le tappe del viaggio e le esclude dai candidati.

`AiExplorerService.interpret` restituisce un errore comprensibile finché non ci sarà una Supabase Edge Function per il linguaggio naturale. OpenAI va chiamata dal backend con verifica UID/membership, limiti persistenti, validazione input/output e controllo degli ID reali. Nessuna chiave OpenAI in variabili VITE, browser o repository.

## Routing

`RoutingService` è predisposto e dichiara `configured: false`. Il pulsante di calcolo mostra perché non è attivo. Le soste sono la somma dei minuti inseriti dall’utente, non una durata totale o una stima di guida. Nessuna distanza, geometria stradale o durata è inventata. Per attivarlo occorrerà integrare Geoapify (preferibilmente via backend), gestire errori/percorsi impossibili e invalidare il riepilogo quando cambia origine o ordine.

## Meteo

`WeatherService.forecast` accetta coordinate, data, ora locale facoltativa e timezone IANA. L’adapter attuale restituisce sempre **Meteo non disponibile**, senza condizioni casuali. I componenti richiedono nuovamente la verifica quando cambiano data, ora o coordinate e annullano la risposta precedente.

La funzione `weatherDecision` tratta maltempo e ambiente separatamente dalla categoria. Con una previsione avversa verificata, le attività all’aperto/miste mostrano la scelta “Mantieni comunque” / “Trova un’alternativa”; la ricerca di alternativa imposta il filtro Al chiuso. Nessuna tappa viene rimossa silenziosamente. Questi rami sono testati con fixture unitarie e non con previsioni reali. Nella versione attuale non scattano avvisi meteorologici specifici perché il provider non è attivo.

Open-Meteo è un candidato adatto all’uso personale: la sua API gratuita è riservata a uso non commerciale con soglie dichiarate di meno di 10.000 chiamate/giorno, 5.000/ora e 600/minuto; i dati richiedono attribuzione CC BY 4.0 e non esiste garanzia di disponibilità. Prima di attivarla verificare nuovamente [condizioni](https://open-meteo.com/en/terms) e [documentazione](https://open-meteo.com/en/docs). Le previsioni arrivano fino a 16 giorni, con orizzonte e risoluzione effettivi dipendenti dal modello.

L’adapter futuro dovrà richiedere la timezone della località (`timezone=auto` o IANA verificata), distinguere l’ora locale dell’attività da quella del dispositivo, scegliere le ore realmente pertinenti e conservare fonte e timestamp. Una data oltre l’orizzonte disponibile o nel passato non deve generare previsioni inventate. Servono cache per coordinate/data, limiti di chiamate, gestione timeout e risposte incomplete. Le coordinate inviate al provider vanno indicate nell’interfaccia prima dell’attivazione; al momento nessuna coordinata viene inviata a un servizio meteo.

## Supabase

Nuovo schema predisposto, nessun progetto configurato o interrogato. Testare migrazioni, RLS, Storage, recupero identità e import in staging prima di attivare la sincronizzazione completa. Vedi [strategia di migrazione](migrazione-v3.md). Non basta pubblicare il frontend su Pages per pubblicare Edge Functions o configurare un database.
