# Ein Bildersatz auf einmal statt fünfzig Bilder einzeln

2026-09-22. Gemeldet mit einem Bild: der Bildwähler, „open" getippt, und
dreissig Kacheln zeigen das zerrissene Blatt. „andere suchen sehen nicht so
mies aus. woran mag das liegen?"

## Was los war

Jeder Treffer war seine eigene Anfrage:
`<img src="https://api.iconify.design/<satz>/<name>.svg">`. Fünfzig pro Suche,
und nach 300 ms Tipppause wieder fünfzig — „open" sind vier Runden, also bis
zu zweihundert Anfragen für ein Wort.

Iconify rationiert genau diesen Endpunkt pro Adresse. Gemessen an dem Tag:

| Anfrage | Antwort |
|---|---|
| `search?query=op` | 200 |
| `mdi/home.svg` | **429**, `Retry-After: 154` |
| `mdi.json?icons=home` | 200 |

Daher das Bild: die **Namen** kommen an, die **Bilder** nicht. Und weil eine
429-Antwort von Cloudflare keinen CORS-Kopf trägt, weist der Browser sie ab,
bevor die Anwendung den Status sehen kann — `fetch` wirft denselben
TypeError wie auf einer Maschine ohne Netz. Die App konnte also gar nicht
wissen, was passiert war, und zeigte kaputte Bilder ohne ein Wort dazu.

Im Browser nachgestellt: von 50 Kacheln luden 35, die letzten 15 nicht.

„Andere Suchen sehen gut aus", weil die erste nach einer Pause durchgeht und
weil Iconify die Einzelbilder eine Woche lang cachebar ausliefert — was schon
einmal geladen wurde, kostet nichts mehr. „op" trifft lauter seltene Sätze,
von denen nichts im Cache liegt.

## Was jetzt passiert

Die Treffer werden nach ihrem **Satz** gruppiert, und jeder Satz wird in
einer Anfrage geholt: `/{satz}.json?icons=a,b,c`. Der liefert die Körper der
Icons, und daraus baut `lib/icon-search.ts` dieselbe SVG-Markierung, die der
Einzel-Endpunkt ausliefern würde — `width="1em"`, das Raster des Satzes als
viewBox — als `data:`-URL. Ein Icon, das vor dieser Änderung in einem Projekt
gespeichert wurde, ist von einem danach gespeicherten nicht zu unterscheiden.

Für die gemeldete Suche: **16 Anfragen statt 50** (eine Suche, fünfzehn
Sätze), alle fünfzig Körper da, kein einziger Fehlschlag. Am selben Tag live
nachgemessen, nicht nur gegen die Aufzeichnung.

Drei Dinge kommen mit:

- **Was geholt wurde, bleibt geholt**, solange der Reiter offen ist. „o", „op",
  „ope", „open" überschneiden sich fast vollständig; die späteren Runden
  kosten dadurch so gut wie nichts.
- **Auswählen kostet keine Anfrage mehr.** Der Körper liegt schon vor. Vorher
  ging derselbe rationierte Endpunkt noch einmal raus — wer bei gedrosseltem
  Dienst ein Icon anklickte, bekam „Failed to select icon".
- **Der Fehler sagt etwas.** Nicht mehr fünfzig zerrissene Blätter, sondern
  ein Satz: der Dienst ist nicht erreichbar, vielleicht drosselt er, in ein
  paar Minuten nochmal. Genauer geht es nicht, siehe oben — der Status ist
  für die Anwendung unsichtbar.

Die Tipppause ist von 300 auf 450 ms gestiegen, damit ein getipptes Wort
nicht vier Suchen auslöst.

**Keine Mindestlänge.** Vorgeschlagen war „erst ab drei Zeichen suchen" —
das hätte ausgerechnet die gemeldete Suche verhindert, denn getippt war „op".
Mit dem Sammel-Endpunkt kostet eine kurze Suche nicht mehr genug, um sie zu
verbieten.

## Aliasse

Ein Satz kann einen Namen als Alias eines anderen führen. Benennt der Alias
nur um, wird der Körper des Originals genommen. Dreht oder spiegelt er ihn,
wird dieses eine Icon beim Einzel-Endpunkt geholt — lieber eine Anfrage mehr
als ein falsch herum gezeichnetes Bild. In fünfzig Treffern kam kein einziger
Alias vor.

Ein Satz, der **gar nicht** antwortet, fällt dagegen ganz aus dem Ergebnis.
Dort einzeln nachzufragen hiesse, den Fünfzig-Anfragen-Sturm genau in dem
Moment wieder aufzubauen, in dem der Dienst um weniger bittet.

## Tests

`e2e/icon-batching.spec.ts`, neu: eine Suche macht **eine Anfrage pro Satz,
keine pro Icon**, jede Kachel zeigt ein echtes Bild (`naturalWidth > 0`, was
ein zerrissenes Blatt nicht hat), und das Auswählen kostet keine Anfrage. Die
Zahlen kommen aus der Aufzeichnung, nicht aus dem Test, damit ein neu
aufgenommener Suchlauf keine veraltete Zahl stehen lässt.

`e2e/icon-service-recording.ts` bedient jetzt beide Endpunkte aus **denselben**
Aufzeichnungen: eine `.svg`-Datei pro Icon, aus der eine Sammelantwort beim
Ausliefern zusammengesetzt und beim Aufzeichnen wieder zerlegt wird. Es musste
nichts neu aufgenommen werden.
