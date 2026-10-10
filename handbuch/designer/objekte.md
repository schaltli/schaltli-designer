# Objekte platzieren

Alles, was ein Screen zeigt, ist ein Objekt: ein Text, eine Tankanzeige, ein Schalter, eine Linie. Welche Objekttypen es gibt und was sie können, steht in der [Objekt-Referenz](/objekte/). Hier geht es darum, wie du Objekte auf den Screen bringst und anordnest.

## Ein Objekt setzen

Wähle ein Werkzeug in der Werkzeugleiste und drück auf dem Screen die Maustaste. Das Objekt erscheint in seiner Grundgrösse und hängt mit seiner Mitte am Mauszeiger. Trag es dorthin, wo es hin soll, und lass los. Ein Klick ohne Bewegung legt es gleich dort ab, wo du geklickt hast. Unterwegs rastet es an Tabellen und anderen Objekten ein, genau wie beim Verschieben, siehe [Zusammenstecken](/objekte/anordnen#zusammenstecken). <kbd>Esc</kbd> vor dem Loslassen nimmt es wieder weg. Danach ist das Objekt ausgewählt, und das Werkzeug springt zurück auf <span class="ui">Select</span>.

Die Grundgrösse: Bedienelemente beginnen in der Grösse <span class="ui">M</span>, ein Bar oder Slider ist 30 mm lang, eine Box 20 × 10 mm, eine Free-Fläche 30 × 20 mm, ein Gauge oder Dial 20 mm gross. Eine Box, eine Free-Fläche, einen Bar oder Slider machst du danach an ihren Anfassern grösser oder kleiner. Bei einem Text oder Button steht der Cursor danach schon im Feld <span class="ui">Text</span>, und der Inhalt ist markiert: Du tippst gleich los, und <kbd>Enter</kbd> oder <kbd>Esc</kbd> schliesst die Eingabe ab. Der Text bleibt, wie du ihn getippt hast, und das Objekt bleibt ausgewählt. Ein zweites <kbd>Esc</kbd> hebt die Auswahl auf.

Einige Werkzeuge verhalten sich anders:

- <span class="ui">Icon</span>, <span class="ui">Live Icon</span>, <span class="ui">Gauge</span> und <span class="ui">Dial</span> sind immer quadratisch.
- Mit <span class="ui">Icon</span> öffnet ein Klick die Icon-Auswahl, und das Icon erscheint dort, wo du geklickt hast.
- <span class="ui">Line</span> und <span class="ui">Live Line</span> zeichnest du weiterhin: Mit gedrückter Maustaste ziehst du eine gerade Linie. Eine gezeichnete Linie rastet nie ein, sie liegt danach frei, und du verschiebst sie wie jedes Objekt in eine Tabelle. Klickst du stattdessen, setzt jeder weitere Klick einen Punkt. <kbd>Enter</kbd> oder ein Doppelklick beenden die Linie, <kbd>Esc</kbd> bricht ab, <kbd>Backspace</kbd> nimmt den letzten Punkt zurück.
- <span class="ui">Row</span> setzt mehrere Objekte auf einmal als eine Zeile, etwa Icon, Text und Schalter, siehe [Eine ganze Zeile](/objekte/anordnen#zusammenstecken).
- <span class="ui">Switcher</span> legt einen Bereich mit einem ersten Panel an. Darüber erscheinen Reiter, einer pro Panel, und <span class="ui">+</span> fügt ein Panel hinzu. Ein Klick auf einen Reiter öffnet dieses Panel zum Bearbeiten, neue Objekte landen dann darin.

Schneller geht es oft mit den [Bausteinen](/designer/bausteine): Sie setzen fertige Objekte, die schon an die richtigen Werte gebunden sind.

## Auswählen

- Ein Klick wählt ein Objekt.
- Mit gedrückter <kbd>Strg</kbd>- oder <kbd>Shift</kbd>-Taste fügst du weitere hinzu oder nimmst sie wieder weg.
- Ziehst du auf einer leeren Stelle, wählst du alles, was im Rahmen liegt.
- <kbd>Strg</kbd>+<kbd>A</kbd> wählt alle Objekte des Screens.
- Ein Klick neben den Screen hebt die Auswahl auf.

## Verschieben und Grösse ändern

Zieh ein Objekt mit der Maus an seinen Platz, die Anfasser an den Ecken und Kanten ändern die Grösse. Linien haben einen Anfasser pro Punkt, <span class="ui">Gauge</span> und <span class="ui">Dial</span> zusätzlich je einen für Anfang und Ende des Bogens.

Beim Verschieben rasten Kanten und Mitte an den Hilfslinien ein, die du unter <span class="ui">Settings</span> › <span class="ui">Snap Grid</span> festlegst.

Genaue Zahlen trägst du in den Eigenschaften unter <span class="ui">Frame</span> ein: X, Y, Breite und Höhe.

## Mehrere Objekte ausrichten

Sind mehrere Objekte ausgewählt, bietet die rechte Spalte an:

- <span class="ui">Align</span>: links, mittig, rechts, oben, mittig, unten.
- <span class="ui">Distribute H</span> und <span class="ui">Distribute V</span>: ab drei Objekten gleichmässig verteilen.
- Gemeinsame Position oder Grösse eintragen und mit <span class="ui">Apply position</span> oder <span class="ui">Apply size</span> übernehmen. Eine [Gruppe](/objekte/anordnen#gruppe) behält dabei ihre Grösse, denn die ergibt sich aus den Objekten darin.

## Die Objektliste

<span class="ui">Objects</span> zeigt alle Objekte des Screens, das vorderste oben. Ein Klick wählt ein Objekt. Durch Ziehen änderst du die Reihenfolge, also was vor was liegt. Ziehst du ein Objekt auf die Mitte eines Panels, landet es in diesem Panel.

Mit dem Schloss am Ende einer Zeile sperrst du ein Objekt auf dem Screen. Ein Klick geht dann durch es hindurch, und verschieben oder in der Grösse ändern lässt es sich dort nicht mehr. In <span class="ui">Objects</span> wählst und bearbeitest du es weiterhin. Das Schloss erscheint, wenn du mit der Maus über die Zeile fährst; bei einem gesperrten Objekt steht es immer da.

## Kopieren und Löschen

<kbd>Strg</kbd>+<kbd>C</kbd> und <kbd>Strg</kbd>+<kbd>V</kbd> kopieren Objekte, auch von einem Screen auf einen anderen. Die Kopie liegt 20 Pixel versetzt. <kbd>Strg</kbd>+<kbd>X</kbd> schneidet aus: Die Objekte verschwinden und lassen sich mit <kbd>Strg</kbd>+<kbd>V</kbd> wieder einsetzen, etwa auf einem anderen Screen. In einer Tabelle fügt <kbd>Strg</kbd>+<kbd>V</kbd> in die gewählte Zelle ein, siehe [Container](/objekte/anordnen#container). Dieselben Befehle stehen im Kontextmenü (Rechtsklick) unter <span class="ui">Copy</span>, <span class="ui">Cut</span> und <span class="ui">Paste</span>.

<kbd>Entf</kbd> oder <kbd>Backspace</kbd> löscht die ausgewählten Objekte, auch wenn du sie in der Objektliste ausgewählt hast.

Der Designer fragt vor dem Löschen nicht nach. <kbd>Strg</kbd>+<kbd>Z</kbd> holt Gelöschtes zurück, an seinen alten Platz und wieder ausgewählt.

## Objekte, die das Gerät nicht kann

Enthält ein Projekt Objekttypen, die das Gerät nicht darstellen kann, etwa nach einem Wechsel des Geräts, zeigt der Designer sie mit einem orangen gestrichelten Rahmen. Beim Übertragen warnt er davor.
