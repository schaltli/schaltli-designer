# Screens und Master

Ein Projekt besteht aus Screens, zwischen denen man auf dem Gerät wechselt: eine Übersicht, ein Screen fürs Licht, einer für die Heizung. Was auf mehreren Screens gleich sein soll, etwa ein Hintergrund oder eine Statuszeile, legst du einmal auf einen Master-Screen.

## Screens anlegen und ordnen

Links in der Liste <span class="ui">Screens</span> öffnet <span class="ui">+</span> ein kleines Menü: <span class="ui">Add Screen</span> oder <span class="ui">Add Master Screen</span>. Im Dialog gibst du einen Namen ein. Für normale Screens schlägt der Designer beim Tippen gleich ein passendes Icon vor. Das Icon brauchen Geräte mit Screen-Menü, etwa der [Knob](/geraete/knob). <span class="ui">Create Screen</span> legt den Screen an.

Die Reihenfolge änderst du, indem du die Vorschaubilder in der Liste verschiebst. Sie ist auch die Reihenfolge, in der <span class="ui">Next screen</span> und <span class="ui">Previous screen</span> blättern.

Fährst du mit der Maus über ein Vorschaubild, erscheint ein Menü mit <span class="ui">Duplicate</span> und <span class="ui">Delete</span>. Löschen geschieht ohne Rückfrage, <kbd>Strg</kbd>+<kbd>Z</kbd> holt den Screen zurück. Den letzten Screen kannst du nicht löschen, ebenso wenig einen Master, den noch Screens verwenden.

<span class="ui">Manage Screens</span> unten in der Liste zeigt alle Screens mit ihren Einstellungen in einer Tabelle.

## Master-Screens

Die Objekte eines Master-Screens erscheinen auf jedem Screen, der ihn verwendet. Bearbeiten kannst du sie nur auf dem Master selbst. Auch die Hintergrundfarbe, das Hintergrundbild und die Belegung der [Hardware-Tasten](/designer/tasten) erbt ein Screen von seinem Master.

Ein Master ist selbst nie auf dem Gerät zu sehen. Er ist kein Ziel für <span class="ui">Go to a screen</span>, und beim Blättern wird er übersprungen.

Jedes Projekt braucht mindestens einen Master. Neue Screens bekommen den ersten Master automatisch.

## Die Eigenschaften eines Screens

Ist nichts ausgewählt, zeigt die rechte Spalte die Eigenschaften des Screens. Du kommst auch dorthin, indem du neben den Screen oder in der Objektliste auf die oberste Zeile klickst.

- **<span class="ui">Screen</span>:** der Name, das Icon und der Master. Mit <span class="ui">Show master</span> blendest du den Master für diesen einen Screen aus.
- **<span class="ui">Swipe navigation</span>:** was Wischen nach links, rechts, oben und unten auslöst, siehe [Hardware-Tasten und Gesten](/designer/tasten#wischgesten). Nur bei Geräten mit Touch.
- **<span class="ui">Colour</span>:** <span class="ui">Background</span> ist die Hintergrundfarbe, ohne eigene Wahl die des Masters. <span class="ui">Grid</span> ist nur die Farbe des Rasters im Editor, das Gerät zeichnet es nicht.
- **<span class="ui">Background image</span>:** ein Bild als Hintergrund, höchstens 5 MB. Hat der Master eins, übernimmt der Screen es, bis du ihm ein eigenes gibst.
