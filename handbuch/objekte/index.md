# Objekt-Referenz

Der Designer kennt 16 Objekttypen. Sie sind in der Werkzeugleiste in Gruppen geordnet, und so auch hier:

| Gruppe | Objekttypen | wofür |
|---|---|---|
| [Anzeigen](/objekte/anzeigen) | [Text](/objekte/anzeigen#text), [Live Text](/objekte/anzeigen#live-text), [Icon](/objekte/anzeigen#icon), [Live Icon](/objekte/anzeigen#live-icon), [Bar](/objekte/anzeigen#bar), [Gauge](/objekte/anzeigen#gauge) | etwas zeigen |
| [Bedienen](/objekte/bedienen) | [Slider](/objekte/bedienen#slider), [Dial](/objekte/bedienen#dial), [Switch](/objekte/bedienen#switch), [Button Group](/objekte/bedienen#button-group), [Button](/objekte/bedienen#button) | etwas schalten oder einstellen |
| [Zeichnen](/objekte/zeichnen) | [Line](/objekte/zeichnen#line), [Live Line](/objekte/zeichnen#live-line), [Box](/objekte/zeichnen#box) | Linien und Flächen |
| [Anordnen](/objekte/anordnen) | [Switcher](/objekte/anordnen#switcher) mit seinen Panels | je nach Wert einen anderen Bereich zeigen |

Was für alle gilt, Farben, Bedingungen, Kalibrierung und was ein Objekt zeigt, bevor ein Wert da ist, steht unter [Gemeinsames](/objekte/gemeinsames).

## Wie die Eigenschaften aufgebaut sind

Wählst du ein Objekt aus, zeigt die rechte Spalte seine Eigenschaften, immer in derselben Reihenfolge:

- <span class="ui">Content</span>: was das Objekt zeigt, etwa Text, Name oder Icon.
- <span class="ui">Data</span> oder <span class="ui">Action</span>: woher die Werte kommen oder was beim Antippen passiert.
- <span class="ui">Shape</span>: Form, Richtung, Stärke.
- Listen wie Zustände, Regeln oder Kalibrierpunkte.
- <span class="ui">Text</span>: Schrift und Ausrichtung.
- <span class="ui">Colour</span>: Farben.
- <span class="ui">Frame</span>: Position und Grösse in Pixeln, zuunterst und zugeklappt.

Ein Feld in grauer Schrift mit Schloss rechnet der Designer selbst aus, etwa die Höhe eines Texts aus der Schrift. Das <span class="ui">?</span> daneben sagt, woraus.

## Nicht jedes Gerät kann alles

Knob, 4.3B, PaperS3 und die Android-App können alle 16 Typen darstellen. Das auslaufende E-Paper-Display kann nichts aus der Gruppe [Bedienen](/objekte/bedienen). Der Designer blendet in der Werkzeugleiste aus, was das Gerät des Projekts nicht kann.
