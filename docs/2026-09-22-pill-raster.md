# Ein Balken hat so glatte Kanten wie ein Ring

2026-09-22, gleich nach dem Schalter. Die Frage des Nutzers war kurz: „kann
man den switch auch noch antialiasen?" Sie stellt sich, seit der Ring es kann
- ein gestufter Knopf neben einem glatten Ring sieht aus wie ein Fehler, und
zwar genau deshalb, weil daneben etwas Glattes liegt.

## Was gebaut wurde

`lib/pill-raster.ts`, ein Geschwister von `lib/arc-raster.ts`, mit denselben
Regeln: Ganzzahlen, Abschneiden statt Runden, Teilpixel auf einem
Achtel-Raster, Deckung als Zahl von 0 bis 16 aus 4x4 Proben, Mischen in 5/6/5
durch `blendBands` aus dem Ring-Rasterer selbst.

`components/canvas/renderers/paint-pills.ts` malt eine Liste solcher Läufe in
einem Durchgang in einen eigenen Puffer und setzt ihn 1:1 auf die Leinwand.

Umgestellt sind der Balken (Spur, Füllung, Griff, Umrisslinie) und der
Schalter (Spur, Knopf, Umrisslinie, Behälter, Knopfgruppe, Ring).

## Die eine Regel, die zählt

**Ein Teilpixel gehört genau einem Lauf** - dem ersten in der Liste, der es
enthält. Deshalb bekommt der Rasterer alle Läufe auf einmal, statt dass einer
nach dem anderen gemalt wird.

Der Grund ist Arithmetik, kein Geschmack. Malt man den Griff über die Spur,
dann rechnet ein halb bedecktes Pixel zweimal: `Griff*c + Spur*c*(1-c) +
Grund*(1-c)²` statt `Griff*c + Spur*(1-c)`. Übrig bleibt ein Saum in der Farbe
dessen, was darunter liegt - rund um jeden Knopf, entlang jeder Wertkante. Und
die Wertkante ist die eine Stelle, auf die an einem Balken überhaupt jemand
schaut.

Gemessen am dunklen Bildschirm: der weisse Knopf mischt sich mit der
**violetten Spur**, nicht mit dem fast schwarzen Hintergrund. Ein Rand aus
Hintergrundfarbe um den Knopf gäbe es nur bei der zweiten Rechenart; `e2e/
pill-raster.spec.ts` prüft genau das, an jedem Pixel der geraden Spurmitte.

Eine **Umrisslinie** ist dieselbe Idee von der anderen Seite: der äussere Lauf
in der Linienfarbe, der innere ohne Farbe davor. Ohne Farbe heisst "nimmt
seine Pixel, malt nichts hinein" - dadurch bleibt sichtbar, was hinter der
Knopfgruppe liegt, wie bei `fillRoundRectRing` bisher auch.

## Wo nicht geglättet wird

Unter 24 Bit gar nicht. Auf einer Ein-Bit-Wand gibt es nichts zum Mischen -
jedes weiche Pixel fällt auf dem Weg zum Glas ohnehin auf Schwarz oder Weiss -
und alle Geräte malen diese Formen heute mit ganzen Pixeln. Der harte Pfad ist
Zeile für Zeile der alte: derselbe `fillRoundRectSides`, dieselben
abgeschnittenen Enden. Nachgewiesen, nicht behauptet: das Ein-Bit-Blatt ist
nach dem Umbau Byte für Byte dasselbe Bild wie davor, und der Test „nothing is
softened below 24 bit" hält das fest.

Vier Bit könnte seine sechzehn Graustufen für eine weiche Kante hernehmen -
aber erst, wenn die eigene Kopie im Gerät genauso quantisiert. Das ist eine
Entscheidung über die Firmware, nicht über den Designer, und bleibt offen.

Ein Pixel, das ein einziger Lauf **ganz** bedeckt, behält dessen Farbe exakt -
ohne Umweg über 5/6/5 und zurück. Jedes andere Objekt hier malt die Farbe des
Autors, wie sie ist; ein Balken, dessen Körper einen Schritt daneben
zurückkäme, passte nicht zum Kasten neben ihm. Gemischt wird nur da, wo eine
Kante durchgeht - dort sieht den Schritt niemand.

## Was das für die Geräte heisst

Der Designer ist ab jetzt voraus. Bis der Rasterer in
`screenbee-firmware/src/project/` und in `LevelShape.kt`/`SwitchShape.kt`
steht, findet der Konformitätslauf an jeder runden Kappe ein paar weiche
Pixel, die das Gerät hart malt - dieselbe Reihenfolge wie beim Ring: erst der
Designer, dann die Abnahme, dann die drei Kopien. Das Ein-Bit-Gerät
(MqttEPaperDisplay2) ist davon nicht betroffen, es behält den harten Pfad.

## Tests

`e2e/pill-raster.spec.ts`, neu: sechs geometrische Aussagen über die Deckung
(innen ganz, aussen nichts, eine runde Ecke genommen, eine eckige nicht, der
Radius klemmt auf die halbe kurze Seite, ein senkrechter Lauf rundet oben und
unten), eine festgenagelte Spalte als Änderungsmelder und für den Port, und
die drei Versprechen am fertigen Bild: weiche Kappe auf 24 Bit, nichts weich
darunter, und die Mischung am Knopf aus Knopf und Spur.
