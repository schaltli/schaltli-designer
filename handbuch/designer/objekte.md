# Objekte platzieren

Alles, was ein Screen zeigt, ist ein Objekt: ein Text, eine Tankanzeige, ein Schalter, eine Linie. Welche Objekttypen es gibt und was sie können, steht in der [Objekt-Referenz](/objekte/). Hier geht es darum, wie du Objekte auf den Screen bringst und anordnest.

## Ein Objekt setzen

Es gibt zwei Wege, und beide beginnen in der [Palette](/designer/#palette):

- **Ziehen:** Drück auf ein Werkzeug, halt die Maustaste und fahr auf den Screen. Sobald der Mauszeiger dort ist, hängt das Objekt in seiner Grundgrösse mit seiner Mitte daran. Lass es los, wo es hin soll.
- **Klicken:** Klick auf ein Werkzeug. Das Objekt hängt am Mauszeiger, sobald du auf den Screen fährst, ohne dass du eine Taste hältst. Ein Klick auf den Screen setzt es dort ab.

Neben dem Mauszeiger steht, was beim Loslassen oder beim Klick passiert, etwa «Click to drop into Card». Über einer Card oder einer leeren Tabellenzelle kommt das Objekt dort hinein, mit <kbd>Alt</kbd> rastet es an Tabellen und anderen Objekten ein, genau wie beim Verschieben, siehe [Zusammenstecken](/objekte/anordnen#zusammenstecken). Danach ist das Objekt ausgewählt, und das Werkzeug ist wieder weggelegt.

Willst du es doch nicht, drückst du <kbd>Esc</kbd>, klickst noch einmal auf dasselbe Werkzeug oder lässt es neben dem Screen los, etwa über der Palette. Dann entsteht nichts, und das Werkzeug ist wieder weggelegt. Ein Klick auf ein anderes Werkzeug nimmt stattdessen dessen Objekt.

Die Grundgrösse: Bedienelemente beginnen in der Grösse <span class="ui">M</span>, ein Bar oder Slider ist 30 mm lang, eine Box 20 × 10 mm, eine Free-Fläche 30 × 20 mm, ein Gauge oder Dial 20 mm gross. Eine Box, eine Free-Fläche, einen Bar oder Slider machst du danach an ihren Anfassern grösser oder kleiner. Bei einem Text oder Button steht der Cursor danach schon im Feld <span class="ui">Text</span>, und der Inhalt ist markiert: Du tippst gleich los, und <kbd>Enter</kbd> oder <kbd>Esc</kbd> schliesst die Eingabe ab. Der Text bleibt, wie du ihn getippt hast, und das Objekt bleibt ausgewählt. Ein zweites <kbd>Esc</kbd> hebt die Auswahl auf.

Einige Werkzeuge verhalten sich anders:

- <span class="ui">Icon</span>, <span class="ui">Gauge</span> und <span class="ui">Dial</span> sind immer quadratisch.
- Mit <span class="ui">Icon</span> klickst du auf den Screen: Der Klick öffnet die Icon-Auswahl, und das Icon erscheint dort, wo du geklickt hast. Aus der Palette ziehen kannst du es nicht.
- <span class="ui">Line</span> und <span class="ui">Live Line</span> hängen nicht am Mauszeiger, du zeichnest sie weiterhin: Mit gedrückter Maustaste ziehst du eine gerade Linie. Eine gezeichnete Linie rastet nie ein, sie liegt danach frei, und du verschiebst sie wie jedes Objekt in eine Tabelle. Klickst du stattdessen, setzt jeder weitere Klick einen Punkt. <kbd>Enter</kbd> oder ein Doppelklick beenden die Linie, <kbd>Esc</kbd> bricht ab, <kbd>Backspace</kbd> nimmt den letzten Punkt zurück.
- <span class="ui">Switcher</span> legt einen Bereich mit einem ersten Panel an. Darüber erscheinen Reiter, einer pro Panel, und <span class="ui">+</span> fügt ein Panel hinzu. Ein Klick auf einen Reiter öffnet dieses Panel zum Bearbeiten, neue Objekte landen dann darin.

Schneller geht es oft mit den [Baugruppen](/designer/baugruppen): Sie setzen fertige Objekte, die schon an die richtigen Werte gebunden sind.

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

Aus der Liste kannst du ein Objekt auch auf den Screen ziehen. So kommst du an alles heran, auch an ein Objekt tief in einer Card oder Tabelle, das du auf dem Screen erst mit mehreren Doppelklicks erreichst. Über dem Screen hängt es mit seiner Mitte am Mauszeiger, als Umriss, und landet beim Loslassen wie beim Verschieben: frei auf dem Screen, in der Card oder Free-Fläche unter dem Mauszeiger oder mit <kbd>Alt</kbd> in einer Tabelle, siehe [Zusammenstecken](/objekte/anordnen#zusammenstecken). Lässt du es in der Liste auf der Mitte einer Tabellenzeile los, kommt es als neue letzte Zeile in diese Tabelle. Ist es selbst eine Tabelle, werden die beiden eine, siehe [Zwei Tabellen zusammenführen](/objekte/anordnen#zusammenstecken).

Mit dem Schloss am Ende einer Zeile sperrst du ein Objekt auf dem Screen. Ein Klick geht dann durch es hindurch, und verschieben oder in der Grösse ändern lässt es sich dort nicht mehr. In <span class="ui">Objects</span> wählst und bearbeitest du es weiterhin. Das Schloss erscheint, wenn du mit der Maus über die Zeile fährst; bei einem gesperrten Objekt steht es immer da.

## Kopieren und Löschen

<kbd>Strg</kbd>+<kbd>C</kbd> und <kbd>Strg</kbd>+<kbd>V</kbd> kopieren Objekte, auch von einem Screen auf einen anderen. Die Kopie liegt 20 Pixel versetzt. Auch in ein anderes Projekt kannst du Objekte einfügen, in einem anderen Browser-Tab oder Designer. Sie liegen dort an derselben Stelle wie im Original und bringen ihre Icons, Topics und Combined Topics mit, wie ein [kopierter Screen](/designer/screens#kopieren). <kbd>Strg</kbd>+<kbd>X</kbd> schneidet aus: Die Objekte verschwinden und lassen sich mit <kbd>Strg</kbd>+<kbd>V</kbd> wieder einsetzen, etwa auf einem anderen Screen. Aus einer Tabelle kopiert, liegt die Kopie frei neben ihr, siehe [Zusammenstecken](/objekte/anordnen#zusammenstecken). Dieselben Befehle stehen im Kontextmenü (Rechtsklick) unter <span class="ui">Copy</span>, <span class="ui">Cut</span> und <span class="ui">Paste</span>.

<kbd>Entf</kbd> oder <kbd>Backspace</kbd> löscht die ausgewählten Objekte, auch wenn du sie in der Objektliste ausgewählt hast.

Der Designer fragt vor dem Löschen nicht nach. <kbd>Strg</kbd>+<kbd>Z</kbd> holt Gelöschtes zurück, an seinen alten Platz und wieder ausgewählt.

## Objekte, die das Gerät nicht kann

Enthält ein Projekt Objekttypen, die das Gerät nicht darstellen kann, etwa nach einem Wechsel des Geräts, zeigt der Designer sie mit einem orangen gestrichelten Rahmen. Beim Übertragen warnt er davor.
