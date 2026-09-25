# Die Oberfläche

Der Designer hat eine feste Aufteilung: oben die Menüleiste und die Werkzeuge, ganz links die Projekte, daneben die Screens, in der Mitte der Screen, den du gerade bearbeitest, rechts die Objekte und ihre Eigenschaften.

<Screenshot name="eigenschaften" alt="Der Designer mit ausgewählter Tankanzeige und ihren Eigenschaften rechts" caption="Die Tankanzeige ist ausgewählt; rechts stehen ihre Eigenschaften." />

## Menüleiste

- Neben «Schaltli» steht der Name des offenen Projekts, mit einem Punkt davor, solange es ungespeicherte Änderungen hat.
- <span class="ui">File</span> enthält alles rund um das Projekt: <span class="ui">New Project</span>, <span class="ui">Save</span>, <span class="ui">Save As...</span>, <span class="ui">Export Project</span>, <span class="ui">Deploy to Device</span>, <span class="ui">Upload Project</span>, <span class="ui">Download Project</span> und <span class="ui">Version History</span>. Mehr dazu unter [Projekte](/designer/projekte), [Auf ein Gerät übertragen](/designer/deploy) und [Versionen und Wiederherstellen](/designer/versionen).
- <span class="ui">Tools</span> blendet die Werkzeugleiste ein und aus.
- <span class="ui">Settings</span> öffnet die Projekteinstellungen, siehe [Projekte](/designer/projekte#projekteinstellungen).
- <span class="ui">Help</span> öffnet dieses Handbuch.
- <span class="ui">Preview</span> startet die [Vorschau](/designer/vorschau).

## Werkzeugleiste

Die Werkzeuge sind in Gruppen geordnet:

| Gruppe | Werkzeuge | wofür |
|---|---|---|
| <span class="ui">Select</span> | <span class="ui">Select</span> | auswählen und verschieben |
| <span class="ui">Show</span> | <span class="ui">Text</span>, <span class="ui">Live Text</span>, <span class="ui">Icon</span>, <span class="ui">Live Icon</span>, <span class="ui">Bar</span>, <span class="ui">Gauge</span> | etwas anzeigen |
| <span class="ui">Operate</span> | <span class="ui">Slider</span>, <span class="ui">Dial</span>, <span class="ui">Switch</span>, <span class="ui">Button Group</span>, <span class="ui">Button</span> | etwas bedienen |
| <span class="ui">Draw</span> | <span class="ui">Line</span>, <span class="ui">Live Line</span>, <span class="ui">Box</span> | Linien und Flächen |
| <span class="ui">Arrange</span> | <span class="ui">Switcher</span> | Bereiche umschalten |
| <span class="ui">Blocks</span> | <span class="ui">Block</span> | fertige [Bausteine](/designer/bausteine) |

Fährst du mit der Maus über ein Werkzeug, erklärt ein kurzer Text, was es tut. Werkzeuge für Objekttypen, die dein Gerät nicht darstellen kann, blendet der Designer aus. Beim auslaufenden E-Paper-Display fehlt zum Beispiel die ganze Gruppe <span class="ui">Operate</span>.

## Projekte

Ganz links listet <span class="ui">Projects</span> alle Projekte, die auf diesem Designer gespeichert sind. Ein Klick öffnet eines, das Menü eines Eintrags benennt es um oder löscht es, und der Knopf im Kopf legt ein neues an. Die Liste lässt sich zu einem schmalen Streifen einklappen. Mehr dazu unter [Projekte](/designer/projekte#projekte-oeffnen-umbenennen-loeschen).

## Screens

Daneben stehen alle Screens des Projekts als kleine Vorschaubilder, oben die Master-Screens, darunter die normalen. Ein Klick öffnet einen Screen im Editor, <span class="ui">+</span> legt einen neuen an. Mehr dazu unter [Screens und Master](/designer/screens).

## Der Screen in der Mitte

In der Mitte steht der Screen in seiner echten Pixelgrösse, im Rahmen des Geräts. Die Tasten im Rahmen, etwa der Drehring des Knob, lassen sich anklicken und belegen, siehe [Hardware-Tasten und Gesten](/designer/tasten).

Ein Rechtsklick öffnet ein kleines Menü mit <span class="ui">Copy</span>, <span class="ui">Paste</span> und <span class="ui">Select All</span>.

## Objekte und Eigenschaften

Rechts oben listet <span class="ui">Objects</span> alle Objekte des Screens, das vorderste oben. Darunter stehen die Eigenschaften dessen, was ausgewählt ist: eines Objekts, mehrerer Objekte oder, wenn nichts ausgewählt ist, des Screens selbst. Die rechte Spalte lässt sich an ihrem linken Rand breiter und schmaler ziehen.

## Statusleiste

Unten rechts stehen die Grösse des Screens, der Schalter <span class="ui">Adornment</span> und der Zoom. <span class="ui">Adornment</span> blendet den Gerätrahmen aus. Du siehst dann den ganzen Bildspeicher, auch die Ecken, die ein rundes Display gar nicht zeigt. Der Zoom geht in ganzen Stufen von 100 bis 500 Prozent, mit dem Regler oder dem Mausrad über dem Screen.

::: warning Es gibt kein Rückgängig
<!-- handbuch-macke #5: kein Undo, Löschen ohne Rückfrage -->
Der Designer kennt kein Rückgängig. Gelöschte Objekte, Screens und Topics sind sofort weg, ohne Rückfrage. Lade vor grösseren Umbauten das Projekt mit <span class="ui">Download Project</span> herunter, dann kannst du es notfalls wieder hochladen.
:::
