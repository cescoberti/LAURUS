---
name: voting-list-split
description: Legge ed espande le votazioni per parti separate (split vote) nelle liste di voto del Parlamento europeo — risolve il riferimento dell'oggetto (§, considerando, emendamento), ritaglia prima parte e seconda parte sul testo inglese su cui lo split è depositato e ne cura la resa italiana con l'originale in calce. Usare SEMPRE quando compare una voting list, una indicative voting list o una liste de vote, quando si leggono le diciture "split", "prima parte", "seconda parte", "tranne i termini", "tali termini", "il resto del testo", "VS", "vote par division", e ogni volta che l'utente chiede cosa si vota su un paragrafo, che cosa cade se una parte non passa, o prepara le indicazioni di voto per la plenaria. Usare anche solo per capire a che cosa si riferisce "tali termini" in una riga.
---

# Split vote — lettura ed espansione

Una lista di voto indicativa è illeggibile da sola: dice *l'insieme del testo
tranne i termini "…"* e presuppone che chi legge abbia la relazione aperta
accanto. Questa skill chiude quella distanza — ricostruisce il testo letterale
di ciascuna parte, così che si veda su che cosa si sta per votare.

## Due piani da non mescolare

**Gli split sono depositati sulla versione inglese.** Da qui discende tutto.

1. **Ritaglio — sull'inglese.** Le parti non si riscrivono: si ritagliano dal
   testo inglese dell'oggetto. Il ritaglio vale solo se ricomponendo le parti
   si riottiene l'originale carattere per carattere. Se la ricomposizione non
   torna, l'espansione **non si pubblica**: si lascia la notazione originale e
   si marca la riga `NON RISOLTA`, con il motivo. Una riga non risolta costa
   una verifica manuale; un'espansione plausibile ma sbagliata fa votare male.

2. **Resa — in italiano.** È una traduzione, non un ritaglio, e non è
   verificabile allo stesso modo: il taglio inglese non sempre cade su un
   tratto contiguo della frase italiana. Quando non combacia si scrive la
   migliore resa possibile e **sotto, nella stessa cella, il testo originale
   dello split**. Chi legge deve poter risalire al testo su cui si vota senza
   uscire dal documento.

Il testo di voto è l'inglese. L'italiano serve a capire, non a votare, e la
lista deve dirlo da sé.

## Come è fatto un blocco split

Un blocco occupa più righe. La testata porta oggetto, autore della richiesta e
la parola `split`; le righe successive descrivono una parte ciascuna, con le
celle di oggetto e autore vuote per ereditarietà.

Come arriva dal servizio seduta:

```
§ 20 |  | The Left | split    |
     |  |          | 1st part | text as a whole excluding the words "…"
     |  |          | 2nd part | those words
```

Come esce da LAURUS: stessa struttura, `prima parte` / `seconda parte`, resa
italiana in cella e originale inglese sotto.

**La lettura è sequenziale, non riga per riga.** `those words` / `tali termini`
non ha significato proprio: rinvia alla citazione della riga precedente dello
stesso blocco. Un parser che tratta le righe come indipendenti perde il
riferimento.

## Le due grammatiche

**A — esclusione** (quasi sempre questa):

> 1st part: *text as a whole excluding the words "X"* · 2nd part: *those words*

- prima parte = tutto il testo dell'oggetto **meno** X
- seconda parte = esattamente X, nient'altro

**B — taglio sequenziale**:

> 1st part: *text up to the words "X"* · 2nd part: *the remainder of the text*

Qui c'è un'ambiguità reale: la formula non dice se X cade di qua o di là dal
taglio. Se la riga non lo esplicita, chiedi — è l'unico caso in cui fermarsi è
meglio che scegliere.

Con più citazioni (*tranne i termini "X" e "Y"*) le parti diventano tre o più.
Attenzione: l'ordine delle parti segue la lista, non il paragrafo.

## Procedura

1. **Testata.** Ricava dal documento il riferimento della relazione
   (`A10-0163/2026`), il relatore, la commissione. Senza riferimento non si
   espande nulla.
2. **Blocchi.** Isola i blocchi split e associa ogni riga-parte alla sua
   testata.
3. **Oggetto in inglese.** Recupera il testo del `§`, del considerando o
   dell'emendamento nella versione EN. Se il recupero fallisce:
   `OGGETTO_NON_RISOLTO`, e ci si ferma qui — senza il testo inglese non c'è
   niente da ritagliare.
4. **Ritaglio e verifica sull'inglese.** Usa `scripts/split_vote.py`. La
   verifica di ricomposizione non è opzionale.
5. **Resa italiana.** Prima il ritaglio sulla versione IT ufficiale; se non
   contiguo, traduzione di lavoro con avviso.
6. **Composizione.** Ogni cella porta la resa italiana e sotto l'originale
   inglese. In apertura, l'elenco delle righe non risolte e di quelle con resa
   non letterale.

## Dall'inglese all'italiano

Ordine di preferenza per la resa, dal più affidabile al meno:

1. **Ritaglio della versione italiana ufficiale.** Recupera il paragrafo nella
   versione IT della relazione e verifica se i termini corrispondenti formano
   un tratto **contiguo e unico**. Se sì, usa quello: è testo di record,
   tradotto dai servizi del Parlamento, non da noi.
2. **Traduzione di lavoro.** Se il tratto non è contiguo — ordine delle parole
   diverso, subordinata ribaltata, termini distribuiti in punti lontani della
   frase — non forzare il ritaglio. Scrivi la migliore resa possibile e
   segnalala come non letterale.

In entrambi i casi il testo originale dello split va sotto, nella cella. Nel
caso 2 è obbligatorio.

La non contiguità è la norma, non l'eccezione: l'italiano riordina. Un tentativo
fallito di ritaglio ufficiale non è un guasto e non va segnalato come errore —
si scala al punto 2 e si va avanti.

Se la versione italiana della relazione non è ancora disponibile (capita per le
liste indicative diffuse subito dopo il deposito), la resa è interamente
traduzione di lavoro: avviso `VERSIONE_IT_ASSENTE` e originale sempre in calce.

## Che cosa produrre

Per ogni blocco:

1. **Testo integrale dell'oggetto**, con le parti separate marcate in linea, per
   far vedere dove cade il taglio.
2. **Prima parte** — il testo come risulterebbe se passasse solo lei.
3. **Seconda parte** (e successive) — i termini isolati.
4. **Che cosa cambia** — una riga sull'effetto se la parte separata non passa.

Ogni cella dei punti 2 e 3 è composta di due righe: la resa italiana, e sotto,
in corpo minore o corsivo, il testo originale dello split preceduto da `[EN]`.

```
seconda parte | tali termini: «l'annuncio della sospensione dei fondi …»
              | [EN] "the announcement of the suspension of funds …"
```

Quando la resa non è letterale la seconda riga è obbligatoria; negli altri casi
resta il default, perché costa una riga e l'inglese è il testo su cui si vota.

Il punto 4 è interpretazione e va tenuto **tipograficamente separato** dal testo
riprodotto, che resta intoccabile (stesso principio di `doc-restyler`: la
riformattazione non riscrive).

La prima parte, privata di un pezzo interno, può restare sgrammaticata o con una
giuntura irregolare. Non aggiustarla: quella asprezza è un'informazione, spesso
il segno che lo split lascia una frase zoppa. Lo script offre `tidy=True` che
chiude solo doppi spazi e spazio prima di punteggiatura — usalo per la resa a
video, mai per il testo che verrà citato come testo di voto.

## Leggere l'autore

Chi chiede lo split di norma vuole **far cadere la parte separata** tenendo il
resto. La colonna autore è quindi un indicatore di posizione: un gruppo che
isola tre righe su un paragrafo di venti sta dicendo dove sta il suo problema.

È un'inferenza, non un dato: talvolta lo split serve a permettere un voto
favorevole altrimenti impossibile, o è concordato fra gruppi. Presentala come
lettura, mai come intenzione accertata.

## Cosa non fare mai

- Ricostruire il testo del paragrafo a memoria invece di recuperarlo.
- Ritagliare sull'italiano: il ritaglio si fa sull'inglese, sempre.
- Forzare la corrispondenza italiana quando il tratto non è contiguo. Meglio
  una resa dichiarata come traduzione che un ritaglio finto.
- Pubblicare una resa non letterale senza l'originale inglese sotto.
- Correggere grammatica o punteggiatura della prima parte.
- Scegliere un'occorrenza quando la citazione ne ha più d'una.
- Confondere `VS` (votazione distinta) con `split`: la prima non divide il testo.
- Usare la numerazione del testo adottato (`TA…`) per una lista pre-voto: dopo
  l'adozione i paragrafi sono rinumerati.
- "Riparare" in silenzio una riga che non torna.

## Uso in pipeline (LAURUS via API)

Nessuna domanda all'utente. Due livelli distinti:

- **Errori** (`TERMINI_NON_TROVATI`, `TERMINI_AMBIGUI`, `RICOMPOSIZIONE_FALLITA`,
  `OGGETTO_NON_RISOLTO`): la riga non si espande, esce con la notazione
  originale intatta e il codice.
- **Avvisi** (`RESA_NON_LETTERALE`, `VERSIONE_IT_ASSENTE`, `RESA_AMBIGUA`): la
  riga si espande, con l'originale inglese in calce e il marcatore.

Il documento va consegnato anche se alcune righe non sono risolte, con l'elenco
in apertura. Un'espansione parziale dichiarata è utile; un'espansione completa e
non verificata, no.

## Strumenti

`scripts/split_vote.py` — ritaglio, normalizzazione tipografica (caporali,
virgolette curve, spazi unificatori, trattini, apici di nota) e verifica di
ricomposizione. Nessuna dipendenza. Eseguirlo direttamente lancia l'autotest.

## Approfondimento

`references/grammatica-liste-di-voto.md` — anatomia completa delle colonne,
catalogo delle notazioni in IT/EN/FR, pattern URL dei documenti, casistica
d'errore, esempio ragionato.

## Skill collegate

- `doc-restyler` — resa grafica del documento finale in formato LAURUS.
- `pe-procedure` — soglie, maggioranze e calendario delle sessioni.
- `ue-open-data` — recupero dei testi dalle fonti istituzionali.
- `traduzione-politica` — glossario istituzionale per le rese multilingue.
