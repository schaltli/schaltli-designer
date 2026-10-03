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

Auf einem Master siehst du einen orangen, gestrichelten Rahmen: den Inhaltsbereich. Ordnet ein Screen dieses Masters seine Objekte mit einem [Layout](#layout), tut er das innerhalb des Rahmens, mit 2 mm Abstand zum Rahmen. Der Rest des Screens bleibt dem Master, zum Beispiel für eine Statuszeile.

<Screenshot narrow name="inhaltsbereich-knob" alt="Der Master des Knob, im runden Display ein oranger, gestrichelter Rahmen mit vier Eckgriffen" caption="Auf dem Knob: das grösste Quadrat im Kreis." />

Am Anfang umfasst der Rahmen den ganzen Screen. Auf einem runden Gerät wie dem [Knob](/geraete/knob) ist es das grösste Quadrat, das in den Kreis passt. So schneidet der Rand nichts ab. Auf dem Master ziehst du den Rahmen an einer Ecke grösser oder kleiner und verschiebst ihn am Rand. Jeder Screen mit diesem Master ordnet seinen Inhalt dann gleich neu an. Auf den Screens selbst siehst du den Rahmen auch, ändern kannst du ihn dort nicht.

Auf einem Screen, dessen Objekte frei stehen, bleibt alles da, wo du es hingesetzt hast. Der Rahmen zeigt dir dann nur, wo auf dem Gerät sicher alles zu sehen ist.

## Layout {#layout}

Unter <span class="ui">Layout</span> wählst du, wie ein Screen ordnet, was auf ihm liegt, ähnlich wie die Folienlayouts in PowerPoint. Jedes Layout zeigt ein kleines Bild davon, noch bevor du es wählst:

| Layout | ordnet |
|---|---|
| <span class="ui">One column</span> | alles untereinander, in einer [Tabelle](/objekte/anordnen#container) mit einer Spalte |
| <span class="ui">Name and control</span> | in einer Tabelle mit zwei Spalten: links die Namen, so breit wie der längste, rechts die Bedienelemente im Rest |
| <span class="ui">Two columns</span> | in einer Tabelle mit zwei gleich breiten Spalten |
| <span class="ui">Free</span> | gar nicht: alles bleibt, wo du es hinsetzt |

<Screenshot narrow name="feld-layout" alt="Der Abschnitt Layout mit vier kleinen Bildern, Name and control ausgewählt" />

Wählst du ein Layout, siehst du die Linien seiner Tabelle sofort auf dem Screen. Ein neuer Screen beginnt mit <span class="ui">Name and control</span>. Was du auf ihn legst, kommt in die Zelle, die beim Überfahren aufleuchtet, oder mit dem <span class="ui">+</span> unter der Tabelle in eine neue Zeile. Klickst du unter den letzten Eintrag, kommt es in eine neue Zeile am Ende. Screens aus Projekten von vor den Tabellen stehen auf <span class="ui">Free</span> und sehen aus wie bisher.

Wechselst du das Layout, geht nichts verloren. Die Objekte kommen in der Reihenfolge, in der sie standen, Zeile für Zeile, in die Zellen der neuen Tabelle. Von <span class="ui">Free</span> aus nimmt der Designer sie so, wie man sie liest, von oben nach unten und von links nach rechts. Zurück auf <span class="ui">Free</span> bleibt jedes Objekt dort, wo es zuletzt stand. Gefällt dir das Ergebnis nicht, holt <kbd>Strg</kbd>+<kbd>Z</kbd> das alte Layout samt Inhalt zurück.

Das Layout ist eine Kopie. Die Tabelle, die es bringt, gehört danach dem Screen, und du stellst sie ein wie jede andere: Spaltenlinien ziehen, Zeilen und Spalten mit <span class="ui">+</span> anfügen. Hast du sie so verändert, ist keines der vier Bilder mehr markiert.

## Die Eigenschaften eines Screens

Ist nichts ausgewählt, zeigt die rechte Spalte die Eigenschaften des Screens. Du kommst auch dorthin, indem du neben den Screen oder in der Objektliste auf die oberste Zeile klickst.

- **<span class="ui">Screen</span>:** der Name, das Icon und der Master. Mit <span class="ui">Show master</span> blendest du die Objekte des Masters für diesen einen Screen aus. Theme und Typografie übernimmt der Screen trotzdem.
- **<span class="ui">Layout</span>:** wie der Screen ordnet, was auf ihm liegt, siehe [Layout](#layout). Nicht bei einem Master.
- **<span class="ui">Swipe navigation</span>:** was Wischen nach links, rechts, oben und unten auslöst, siehe [Hardware-Tasten und Gesten](/designer/tasten#wischgesten). Nur bei Geräten mit Touch.
- **<span class="ui">Look</span>:** <span class="ui">Theme</span> ist das Theme des Screens, ohne eigene Wahl das des Masters, siehe [Themes und Farben](/designer/themes). <span class="ui">Typography</span> legt fest, welche Schriften die [Stile](/objekte/anzeigen#stile) bekommen; ohne eigene Wahl gilt auch hier die des Masters. Das Feld erscheint nur, wenn das Gerät mehr als eine Typografie hat. Wählst du eine andere, bekommen alle Texte mit Stil auf dem Screen deren Schriften, auf einem Master auch die Texte der Screens, die seine übernehmen. Fehlt dem Gerät die gewählte, etwa nach einem Gerätewechsel, gilt «Standard», die Typografie, die jedes Gerät hat. <span class="ui">Background</span> ist die Rolle des Hintergrunds, ohne eigene Wahl die des Masters.

<Screenshot narrow name="feld-typography" alt="Unter Look die Felder Theme, Typography und Background" caption="Look: Theme und Typography nebeneinander." />
