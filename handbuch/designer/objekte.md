# Objekte platzieren

Alles, was ein Screen zeigt, ist ein Objekt: ein Text, eine Tankanzeige, ein Schalter, eine Linie. Welche Objekttypen es gibt und was sie können, steht in der Objekt-Referenz, die als nächstes Kapitel folgt. Hier geht es darum, wie du Objekte auf den Screen bringst und anordnest.

## Ein Objekt setzen

Wähle ein Werkzeug in der Werkzeugleiste und zieh auf dem Screen ein Rechteck auf. Das Objekt entsteht in dieser Grösse, ist gleich ausgewählt, und das Werkzeug springt zurück auf <span class="ui">Select</span>.

Einige Werkzeuge verhalten sich anders:

- <span class="ui">Icon</span>, <span class="ui">Live Icon</span>, <span class="ui">Gauge</span> und <span class="ui">Dial</span> sind immer quadratisch.
- Mit <span class="ui">Icon</span> kannst du auch einfach klicken. Dann öffnet sich die Icon-Auswahl, und das Icon erscheint dort, wo du geklickt hast.
- <span class="ui">Line</span> und <span class="ui">Live Line</span> ziehen mit der Maus eine gerade Linie. Klickst du stattdessen, setzt jeder weitere Klick einen Punkt. <kbd>Enter</kbd> oder ein Doppelklick beenden die Linie, <kbd>Esc</kbd> bricht ab, <kbd>Backspace</kbd> nimmt den letzten Punkt zurück.
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
- Gemeinsame Position oder Grösse eintragen und mit <span class="ui">Apply position</span> oder <span class="ui">Apply size</span> übernehmen.

## Die Objektliste

<span class="ui">Objects</span> zeigt alle Objekte des Screens, das vorderste oben. Ein Klick wählt ein Objekt. Durch Ziehen änderst du die Reihenfolge, also was vor was liegt. Ziehst du ein Objekt auf die Mitte eines Panels, landet es in diesem Panel.

## Kopieren und Löschen

<kbd>Strg</kbd>+<kbd>C</kbd> und <kbd>Strg</kbd>+<kbd>V</kbd> kopieren Objekte, auch von einem Screen auf einen anderen. Die Kopie liegt 20 Pixel versetzt.

<kbd>Entf</kbd> löscht die ausgewählten Objekte. Dafür muss der Screen den Fokus haben: Klick vorher einmal auf den Screen.

::: warning Löschen ohne Rückfrage, ohne Rückgängig
<!-- handbuch-macke #5: kein Undo, Löschen ohne Rückfrage -->
Gelöschte Objekte sind sofort weg. Der Designer fragt nicht nach und kennt kein Rückgängig.
:::

## Objekte, die das Gerät nicht kann

Enthält ein Projekt Objekttypen, die das Gerät nicht darstellen kann, etwa nach einem Wechsel des Geräts, zeigt der Designer sie mit einem orangen gestrichelten Rahmen. Beim Übertragen warnt er davor.
