# Screens und Master

Ein Projekt besteht aus Screens, zwischen denen man auf dem Gerät wechselt: eine Übersicht, ein Screen fürs Licht, einer für die Heizung. Was auf mehreren Screens gleich sein soll, etwa ein Hintergrund oder eine Statuszeile, legst du einmal auf einen Master-Screen.

## Screens anlegen und ordnen

Links in der Liste <span class="ui">Screens</span> öffnet <span class="ui">+</span> ein kleines Menü: <span class="ui">Add Screen</span> oder <span class="ui">Add Master Screen</span>. Im Dialog gibst du einen Namen ein. Für normale Screens schlägt der Designer beim Tippen gleich ein passendes Icon vor. Das Icon brauchen Geräte mit Screen-Menü, etwa der [Knob](/geraete/knob). <span class="ui">Create Screen</span> legt den Screen an.

Die Reihenfolge änderst du, indem du die Vorschaubilder in der Liste verschiebst. Sie ist auch die Reihenfolge, in der <span class="ui">Next screen</span> und <span class="ui">Previous screen</span> blättern.

Fährst du mit der Maus über ein Vorschaubild, erscheint ein Menü mit <span class="ui">Duplicate</span> und <span class="ui">Delete</span>. Löschen geschieht ohne Rückfrage, <kbd>Strg</kbd>+<kbd>Z</kbd> holt den Screen zurück. Den letzten Screen kannst du nicht löschen, ebenso wenig einen Master, den noch Screens verwenden.

<span class="ui">Manage Screens</span> unten in der Liste zeigt alle Screens mit ihren Einstellungen in einer Tabelle.

## Master-Screens

Die Objekte eines Master-Screens erscheinen auf jedem Screen, der ihn verwendet. Bearbeiten kannst du sie nur auf dem Master selbst. Auch das [Theme](/designer/themes), die Hintergrundfarbe und die Belegung der [Hardware-Tasten](/designer/tasten) erbt ein Screen von seinem Master.

Ein Master ist selbst nie auf dem Gerät zu sehen. Er ist kein Ziel für <span class="ui">Go to a screen</span>, und beim Blättern wird er übersprungen.

Jeder Screen hat einen Master, denn von ihm bekommt er sein Theme und seine Typografie. Ein neuer Screen bekommt den Master, den du gerade vor dir hast: den Master, der offen ist, oder den Master des Screens, der offen ist. Einen Master, den noch Screens verwenden, kannst du nicht löschen, und den letzten auch nicht.

### Der Inhaltsbereich {#inhaltsbereich}

Auf einem Master siehst du einen orangen, gestrichelten Rahmen: den Inhaltsbereich. Ist ein Screen dieses Masters selbst ein [Container](/objekte/anordnen#container), etwa ein Stack, ordnet er seine Objekte innerhalb des Rahmens an. Der Rest des Screens bleibt dem Master, zum Beispiel für eine Statuszeile.

Am Anfang umfasst der Rahmen den ganzen Screen. Auf einem runden Gerät wie dem [Knob](/geraete/knob) ist es das grösste Quadrat, das in den Kreis passt. So schneidet der Rand nichts ab. Auf dem Master ziehst du den Rahmen an einer Ecke grösser oder kleiner und verschiebst ihn am Rand. Jeder Screen mit diesem Master ordnet seinen Inhalt dann gleich neu an. Auf den Screens selbst siehst du den Rahmen auch, ändern kannst du ihn dort nicht.

Auf einem Screen, dessen Objekte frei stehen, bleibt alles da, wo du es hingesetzt hast. Der Rahmen zeigt dir dann nur, wo auf dem Gerät sicher alles zu sehen ist.

## Die Eigenschaften eines Screens

Ist nichts ausgewählt, zeigt die rechte Spalte die Eigenschaften des Screens. Du kommst auch dorthin, indem du neben den Screen oder in der Objektliste auf die oberste Zeile klickst.

- **<span class="ui">Screen</span>:** der Name, das Icon und der Master. Mit <span class="ui">Show master</span> blendest du die Objekte des Masters für diesen einen Screen aus. Theme und Typografie übernimmt der Screen trotzdem.
- **<span class="ui">Swipe navigation</span>:** was Wischen nach links, rechts, oben und unten auslöst, siehe [Hardware-Tasten und Gesten](/designer/tasten#wischgesten). Nur bei Geräten mit Touch.
- **<span class="ui">Look</span>:** <span class="ui">Theme</span> ist das Theme des Screens, ohne eigene Wahl das des Masters, siehe [Themes und Farben](/designer/themes). <span class="ui">Typography</span> legt fest, welche Schriften die [Stile](/objekte/anzeigen#stile) bekommen; ohne eigene Wahl gilt auch hier die des Masters. Das Feld erscheint nur, wenn das Gerät mehr als eine Typografie hat. Wählst du eine andere, bekommen alle Texte mit Stil auf dem Screen deren Schriften, auf einem Master auch die Texte der Screens, die seine übernehmen. Fehlt dem Gerät die gewählte, etwa nach einem Gerätewechsel, gilt «Standard», die Typografie, die jedes Gerät hat. <span class="ui">Background</span> ist die Rolle des Hintergrunds, ohne eigene Wahl die des Masters.

<Screenshot narrow name="feld-typography" alt="Unter Look die Felder Theme, Typography und Background" caption="Look: Theme und Typography nebeneinander." />
