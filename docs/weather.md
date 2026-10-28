# Meteo in ATLAS

Provider reale: [Open-Meteo Forecast API](https://open-meteo.com/en/docs), senza API key per questo uso personale non commerciale. Nessuna variabile `.env.local` aggiuntiva. Credenziali Supabase e Geoapify invariate. API gratuita soggetta ai [termini e limiti del provider](https://open-meteo.com/en/terms); attribuzione Open-Meteo / CC BY 4.0 visibile accanto alle previsioni. Non è un servizio di allerta o una garanzia delle condizioni effettive.

## Implementazione

- `src/services/weather.ts`: esporta il servizio condiviso implementato in `supabase/functions/_shared/atlas/weather.ts`, coordinate del singolo luogo, `timezone=auto`, timestamp Unix convertiti con il fuso IANA della risposta; dati orari fino a 16 giorni. Data e ora visita sono locali al luogo. Senza ora: riepilogo della giornata locale, con massimi di probabilità/vento, min/max temperatura e somme di pioggia/precipitazioni. I dati assenti rimangono sconosciuti; nessuna previsione simulata nell’app.
- `src/services/weatherPolicy.ts`: esporta le soglie modificabili da `supabase/functions/_shared/atlas/weatherPolicy.ts`. Probabilità precipitazioni ≥60%; precipitazioni ≥1 mm/ora oppure ≥5 mm/giorno; vento ≥35 km/h; raffiche ≥50 km/h; codici WMO temporali 95/96/99 e precipitazioni gelate/neve. La probabilità giornaliera è il massimo orario, non la probabilità cumulativa dell’intera giornata.
- Cache in memoria 15 minuti, massimo 64 località; unica richiesta condivisa per le diverse date/ore della stessa località. Errori memorizzati 30 secondi, timeout 15 secondi. Budget per istanza: 20 richieste/minuto e 1000/giorno UTC. Explorer verifica massimo 20 candidati, in gruppi di tre; gli altri rimangono visibili come non verificati. Budget e cache non sono quote globali tra dispositivi o schede: restano applicabili i limiti del provider, con errore gestito su HTTP 429.
- Cambiare data, ora o coordinate cambia immediatamente la selezione meteo. L’annullamento di un componente non interrompe una richiesta condivisa da altri componenti. Previsioni visualizzate in Viaggi aggiornate ogni 15 minuti; risultati Explorer scaduti richiedono una nuova ricerca.
- Nessun nome, foto, profilo, token Supabase o chiave Geoapify inviato a Open-Meteo: la richiesta contiene coordinate del luogo scelto e parametri meteo.

## Viaggi ed Explorer

Viaggi mostra un elemento meteo per tappa, dettagli espandibili e attribuzione. L’ambiente esistente `INDOOR`/`OUTDOOR`/`MIXED` è riutilizzato; se assente la scheda dice “Ambiente da specificare”. Il modulo richiede una scelta esplicita. Non viene dedotta la classificazione dalla categoria.

Con percorso Geoapify valido e ora di partenza, il fuso della partenza viene verificato; gli arrivi assoluti includono guida e soste. Ogni previsione usa poi giorno e ora nel fuso della tappa, anche oltre mezzanotte. Gli orari ripetuti/inesistenti al cambio d’ora richiedono una scelta diversa. In assenza di un percorso con tratti validi non vengono inventati arrivi: si usa il riepilogo giornaliero, oppure l’ora visita esplicitamente trasferita da Explorer. L’orario Explorer viene proposto anche come partenza, modificabile e indicato nell’interfaccia.

Explorer conserva i filtri espliciti, incluso Ambiente esatto: “Al chiuso” non include attività miste. Ordina prima le opzioni compatibili con il meteo, conserva quelle rischiose e quelle non verificabili. Per selezionare un risultato all’aperto/misto con avvisi serve “Mantieni comunque”. “Cerca al chiuso” cambia esplicitamente il filtro Ambiente e torna alle scelte, senza cambiare gli altri filtri. Il linguaggio naturale rimane non disponibile come prima: il meteo è integrato nella ricerca guidata esistente.

Il trasferimento a Viaggi conserva data, ora e conferme insieme alle altre preferenze; la cache condivisa evita nuove richieste identiche. Le conferme si riferiscono a luogo, finestra visita, aggiornamento della previsione e rischi: cambiandoli la conferma precedente non vale. Nessuna attività viene eliminata automaticamente dal viaggio; gli avvisi non bloccano il salvataggio o le attività al chiuso.

## Database

**Nessuna migrazione SQL necessaria o eseguita.** Ambiente è già in `atlas_experiences.data`; contesto visita e conferme usano `atlas_trips.data.planningPreferences`, JSONB già previsto. Le previsioni temporanee non vengono salvate come verità permanenti. Nessun cambiamento a database remoto, RLS, account, condivisione, Storage o configurazioni Geoapify. Il percorso storico locale ora conserva l’assenza di Ambiente invece di assegnare automaticamente “Misto”; non modifica retroattivamente dati già classificati o importati.

## Verifiche eseguite

- Suite automatica completa: typecheck, test e build PWA. Test meteo isolati su soglie, null, rete/HTTP/dati invalidi, orizzonte, coordinate/orari invalidi, cache/scadenza/deduplica, cancellazione indipendente, limiti, fusi e cambio d’ora, ambiente ignoto, attività indoor non bloccate, mantenimento dei filtri e degli outdoor rischiosi, conferme e arrivi con soste.
- Test SQL eseguiti esclusivamente su PGlite locale: persistono anche contesto meteo/conferme nel JSON del viaggio; l’utente estraneo rimane escluso dalle policy esistenti. Non è una verifica su un nuovo viaggio salvato nel progetto Supabase remoto.
- Browser: chiamata reale per coordinate pubbliche di Berlino (52.52, 13.405), visita 27 ottobre 2026 alle 14:30, risposta nel fuso Europe/Berlin; dettagli e data lontana. Provato con componenti reali il trasferimento Explorer → Viaggi, con stessa previsione oraria. Nessun account/dato remoto modificato. Il piccolo harness temporaneo di verifica viene rimosso, non fa parte dell’app.
- Gli avvisi di maltempo sono verificati con fixture nei test, non sostituendo la risposta reale nell’app. Da completare manualmente: percorso con dati del proprio account Chrome, salvataggio/riapertura remoto del viaggio, installazione e controlli su iPhone/Android.

## Test manuale nell’app

1. Aprire http://127.0.0.1:5173/ in Chrome e accedere con il proprio account.
2. Aprire un’esperienza con coordinate selezionate tramite Geoapify o corrette sul pin; **Modifica → Ambiente → All’aperto**, quindi salvare. Nessuna categoria determina automaticamente l’ambiente.
3. In **Viaggi**, aggiungere la tappa e scegliere domani o una data vicina. Espandere **Dettagli meteo** per probabilità, pioggia, vento, codice WMO, fuso e aggiornamento. Una data tra molti mesi deve mostrare **Previsioni non ancora disponibili**.
4. Aggiungere una partenza e almeno un’altra posizione, scegliere l’ora e calcolare il percorso: verificare la dicitura **arrivo stimato** e cambiare le soste per aggiornare gli orari.
5. Se la previsione reale supera le soglie, provare **Mantieni comunque** e **Cerca al chiuso**. Con tempo favorevole l’avviso non deve comparire: non viene forzato per la dimostrazione. Impostare una tappa su **Al chiuso**: nessuna richiesta di conferma meteo.
6. In **AI Explorer**, mantenere i propri filtri, scegliere giorno/ora e cercare; aprire i risultati in Viaggi. Le tappe outdoor rischiose restano visibili, da confermare esplicitamente. Salvare il viaggio e riaprirlo per verificare il proprio flusso remoto.
7. Per provare la rete assente, mettere il browser offline e usare una località non in cache (o attendere 15 minuti): **Meteo temporaneamente non disponibile**; il resto dell’interfaccia continua a funzionare secondo i limiti della connessione.
