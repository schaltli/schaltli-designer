# Die Oberfläche

Der Designer hat eine feste Aufteilung: oben die Menüleiste, ganz links die Projekte, daneben die Screens und die Palette mit den Werkzeugen, in der Mitte der Screen, den du gerade bearbeitest, rechts die Objekte und ihre Eigenschaften.

<Screenshot name="eigenschaften" alt="Der Designer mit ausgewählter Tankanzeige und ihren Eigenschaften rechts" caption="Die Tankanzeige ist ausgewählt; rechts stehen ihre Eigenschaften." />

## Menüleiste

- Neben «Schaltli» steht der Name des offenen Projekts, mit einem Punkt davor, solange es ungespeicherte Änderungen hat.
- <span class="ui">File</span> enthält alles rund um das Projekt: <span class="ui">New Project</span>, <span class="ui">Save</span>, <span class="ui">Save As...</span>, <span class="ui">Export Project</span>, <span class="ui">Deploy to Device</span>, <span class="ui">Upload Project</span>, <span class="ui">Download Project</span> und <span class="ui">Version History</span>. Mehr dazu unter [Projekte](/designer/projekte), [Auf ein Gerät übertragen](/designer/deploy) und [Versionen und Wiederherstellen](/designer/versionen).
- <span class="ui">Settings</span> öffnet die Projekteinstellungen, siehe [Projekte](/designer/projekte#projekteinstellungen).
- <span class="ui">Undo</span> und <span class="ui">Redo</span>, die beiden Pfeile daneben, nehmen die letzte Änderung zurück oder stellen sie wieder her, siehe «Rückgängig machen» weiter unten.
- <span class="ui">Help</span> öffnet dieses Handbuch.

Unter dem Gerät steht ein roter Schalter mit <span class="ui">Preview</span> und <span class="ui">Designer</span>. Er zeigt, wo du gerade bist, und wechselt zwischen der [Vorschau](/designer/vorschau) und dem Editor.

## Palette {#palette}

Was du auf einen Screen setzt, holst du aus der Palette, einem Fenster wie die Shapes in Visio. Oben hat sie zwei Reiter: <span class="ui">Parts</span> mit einem Klemmbaustein für die einzelnen Werkzeuge und <span class="ui">Prebuilt</span> mit zwei aufeinander für die fertigen [Baugruppen](/designer/baugruppen), die die Geräte auf deinem Broker ankündigen. Darunter steht ein Suchfeld. Was du eintippst, filtert den offenen Reiter nach Namen, bei <span class="ui">Prebuilt</span> auch nach dem Namen des Geräts, und die passenden Gruppen gehen dabei auf. Der Suchtext bleibt stehen, wenn du den Reiter wechselst. Darunter stehen die Einträge in Gruppen, jeder mit Icon und Namen. Ein Klick auf den Namen einer Gruppe klappt sie auf oder zu. Beim ersten Mal ist in jedem Reiter nur die erste Gruppe offen.

Die Palette kann an drei Orten stehen:

- **Schwebend** über dem Canvas. Du verschiebst sie an ihrer Titelzeile und ziehst sie an ihren Rändern grösser oder kleiner. Sie bleibt immer im Fenster.
- **Angedockt** als Spalte neben den Screens. Der Knopf mit dem Rahmen in der Titelzeile dockt sie an und lässt sie wieder schweben.
- **Minimiert** zu einer schmalen Leiste mit den Icons der beiden Reiter. Der Strich in der Titelzeile minimiert sie. Ein Klick auf ein Icon der Leiste öffnet die Palette auf diesem Reiter wieder, schwebend oder angedockt, wie sie vorher war.

<kbd>Strg</kbd>+<kbd>K</kbd> öffnet die Palette und setzt den Cursor ins Suchfeld. Der Designer merkt sich, wo die Palette steht, wie gross sie ist, welcher Reiter und welche Gruppen offen sind.

Unter <span class="ui">Parts</span> sind die Werkzeuge in Gruppen geordnet:

| Gruppe | Werkzeuge | wofür |
|---|---|---|
| <span class="ui">Show</span> | <span class="ui">Text</span>, <span class="ui">Icon</span>, <span class="ui">Bar</span>, <span class="ui">Gauge</span> | etwas anzeigen |
| <span class="ui">Operate</span> | <span class="ui">Slider</span>, <span class="ui">Dial</span>, <span class="ui">Switch</span>, <span class="ui">Button Group</span>, <span class="ui">Button</span>, <span class="ui">Text field</span>, <span class="ui">Time field</span> | etwas bedienen |
| <span class="ui">Draw</span> | <span class="ui">Line</span>, <span class="ui">Live Line</span>, <span class="ui">Box</span> | Linien und Flächen |
| <span class="ui">Arrange</span> | <span class="ui">Switcher</span> | Bereiche umschalten |
| <span class="ui">Tables</span> | <span class="ui">Free</span>, <span class="ui">Card</span> | eine freie Fläche, eine als [Karte](/objekte/anordnen#card) |

Fährst du mit der Maus über ein Werkzeug, erklärt ein kurzer Text, was es tut. Wie du ein Objekt aus der Palette auf den Screen bringst, steht unter [Ein Objekt setzen](/designer/objekte#ein-objekt-setzen); <kbd>Esc</kbd> legt das Werkzeug wieder weg. Werkzeuge für Objekttypen, die dein Gerät nicht darstellen kann, blendet der Designer aus. <span class="ui">Free</span> gibt es immer, weil das Gerät keine freie Fläche sieht, nur was darin steht.

Ein Werkzeug für Tabellen gibt es nicht: Eine Tabelle entsteht, sobald du zwei Objekte zusammensteckst, siehe [Zusammenstecken](/objekte/anordnen#zusammenstecken).

## Projekte

Ganz links listet <span class="ui">Projects</span> alle Projekte, die auf diesem Designer gespeichert sind. Ein Klick öffnet eines, das Menü eines Eintrags benennt es um oder löscht es, und der Knopf im Kopf legt ein neues an. Die Liste lässt sich zu einem schmalen Streifen einklappen. Mehr dazu unter [Projekte](/designer/projekte#projekte-oeffnen-umbenennen-loeschen).

## Screens

Daneben stehen alle Screens des Projekts als kleine Vorschaubilder, oben die Master-Screens, darunter die normalen. Ein Klick öffnet einen Screen im Editor, <span class="ui">+</span> legt einen neuen an. Mehr dazu unter [Screens und Master](/designer/screens).

## Der Screen in der Mitte

In der Mitte steht der Screen in seiner echten Pixelgrösse, im Rahmen des Geräts. Die Tasten im Rahmen, etwa der Drehring des Knob, lassen sich anklicken und belegen, siehe [Hardware-Tasten und Gesten](/designer/tasten).

Ein Rechtsklick öffnet ein kleines Menü mit <span class="ui">Copy</span>, <span class="ui">Paste</span>, <span class="ui">Select All</span>, <span class="ui">Group</span> und <span class="ui">Ungroup</span>. Ist ein Slider, Dial, Bar, Gauge, Switch oder eine Button Group ausgewählt, steht dort auch <span class="ui">Convert to</span>, siehe [Umwandeln](/objekte/gemeinsames#umwandeln).

Ein Klick auf ein Objekt einer [Gruppe](/objekte/anordnen#gruppe) wählt die ganze Gruppe, ein Doppelklick führt hinein zum einzelnen Objekt.

## Objekte und Eigenschaften

Rechts oben listet <span class="ui">Objects</span> alle Objekte des Screens, das vorderste oben. Darunter stehen die Eigenschaften dessen, was ausgewählt ist: eines Objekts, mehrerer Objekte oder, wenn nichts ausgewählt ist, des Screens selbst. Die rechte Spalte lässt sich an ihrem linken Rand breiter und schmaler ziehen.

## Statusleiste

Unten rechts stehen die Grösse des Screens, die Schalter <span class="ui">Dark</span> und <span class="ui">Adornment</span> und der Zoom. <span class="ui">Dark</span> zeigt die dunkle Variante der Themes, siehe [Themes und Farben](/designer/themes#hell-und-dunkel). <span class="ui">Adornment</span> blendet den Gerätrahmen aus. Du siehst dann den ganzen Bildspeicher, auch die Ecken, die ein rundes Display gar nicht zeigt. Der Zoom geht in ganzen Stufen von 100 bis 500 Prozent, mit dem Regler oder dem Mausrad über dem Screen.

## Rückgängig machen

<kbd>Strg</kbd>+<kbd>Z</kbd> nimmt die letzte Änderung am Projekt zurück. <kbd>Strg</kbd>+<kbd>Y</kbd> oder <kbd>Strg</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> stellt sie wieder her. Das gilt für alles, was zum Projekt gehört: Objekte, Screens, Topics, Einstellungen. Der Designer springt dabei auf den Screen, auf dem du die Änderung gemacht hast, und wählt wieder aus, was damals ausgewählt war.

Ein Schritt ist jeweils ein Handgriff, etwa ein Verschieben mit der Maus oder ein Löschen. Tippst du in ein Feld, zählt alles bis zum Verlassen des Felds oder bis zu einer Pause von einer Sekunde als ein Schritt.

Der Designer merkt sich die letzten 100 Schritte, bis du die Seite neu lädst. Öffnest du ein anderes Projekt, legst ein neues an oder stellst eine Version wieder her, fängt die Liste von vorn an. Ein Deploy zählt nicht als Schritt: Auf welches Gerät das Projekt zuletzt ging, bleibt auch nach einem Rückgängig stehen.
