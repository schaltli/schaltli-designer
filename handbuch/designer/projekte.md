# Projekte

Ein Projekt enthält alles, was auf ein Gerät kommt: die Screens mit ihren Objekten, die Topics, die Icons und Bilder. Es gehört immer zu genau einem Gerätetyp.

Projekte liegen auf dem Rechner, auf dem der Designer läuft, wie Dateien in einem Ordner. Jedes hat einen Namen, und unter diesem Namen findest du es wieder, egal von welchem Browser aus du den Designer öffnest.

## Ein neues Projekt

<span class="ui">New Project...</span> auf der Startseite, der Knopf <span class="ui">New Project</span> im Kopf der Projektliste oder <span class="ui">File</span> › <span class="ui">New Project</span> öffnen denselben Dialog in zwei Schritten.

Zuerst wählst du das Gerät:

- <span class="ui">Server DDFs</span>: die Geräte, die der Designer mitbringt.
- <span class="ui">Announced Devices</span>: Geräte, die sich gerade beim Broker melden, auch Android-Handys.
- Geräte, die sich früher gemeldet haben und gerade nicht online sind, blendet ein Link darunter ein.

Ein Klick wählt ein Gerät, <span class="ui">Next</span> führt weiter. Ein Doppelklick erledigt beides.

Dann gibst du dem Projekt einen Namen. <span class="ui">Create Project</span> speichert es und öffnet es im Editor. Ist der Name schon vergeben, sagt der Dialog das und legt nichts an. <span class="ui">Back</span> führt zurück zur Geräteauswahl.

Ein neues Projekt hat einen Master-Screen «Master 1» mit dem [Theme](/designer/themes) Lavender und einen Screen «Screen 1», der diesen Master verwendet. Grösse, Farbtiefe, Schriften und Gerätrahmen kommen vom Gerät.

Über das Feld <span class="ui">Add</span> in der Geräteauswahl fügst du ein Gerät hinzu, dessen Beschreibung (eine `.ddf.zip`-Datei) im Internet liegt.

## Namen

Der Name ist das, woran der Designer ein Projekt erkennt. Er darf bis zu 80 Zeichen lang sein. Nicht erlaubt sind `/ \ : * ? " < > |`, ein Punkt am Ende und Namen, die Windows für sich reserviert, etwa `CON` oder `NUL`. Gross- und Kleinschreibung zählt nicht: «Van Knob» und «van knob» sind dasselbe Projekt.

Der Name steht oben neben «Schaltli» und in der Adresse des Browsers, etwa `…/projects/Van%20Knob`. Diese Adresse kannst du als Lesezeichen ablegen, und Neuladen bleibt im Projekt.

## Speichern

Der Designer speichert nur, wenn du es sagst:

- <span class="ui">File</span> › <span class="ui">Save</span> oder <kbd>Strg</kbd>+<kbd>S</kbd> speichert das Projekt unter seinem Namen.
- <span class="ui">File</span> › <span class="ui">Save As...</span> oder <kbd>Strg</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> speichert es unter einem anderen Namen. Danach arbeitest du unter dem neuen weiter, das alte Projekt bleibt, wie es war.

Solange etwas nicht gespeichert ist, steht ein Punkt vor dem Namen, oben und im Tab des Browsers. Machst du mit Rückgängig alles bis zum gespeicherten Stand zurück, verschwindet er wieder.

Hat ein Projekt noch keinen Namen, etwa eine hochgeladene Datei, heisst es «Untitled». Das erste Speichern öffnet dann den Dialog <span class="ui">Save Project</span>. Er zeigt die Projekte, die es schon gibt, und ein Feld für den Namen. Wählst du ein bestehendes Projekt, fragt er nach: <span class="ui">Replace</span> macht dein Projekt zur neuesten Version des gewählten. Dessen frühere Versionen bleiben erhalten, siehe [Versionen](/designer/versionen).

Jedes Speichern legt eine neue [Version](/designer/versionen) an. Auch jede [Übertragung auf ein Gerät](/designer/deploy) speichert vorher.

Verlässt du ein Projekt mit ungespeicherten Änderungen, fragt der Designer <span class="ui">Save changes to</span> …, mit <span class="ui">Save</span>, <span class="ui">Don't Save</span> und <span class="ui">Cancel</span>. Das gilt, wenn du ein anderes Projekt öffnest, ein neues anlegst oder eine Datei hochlädst. Schliesst oder lädst du den Tab neu, warnt der Browser selbst.

## Projekte öffnen, umbenennen, löschen {#projekte-oeffnen-umbenennen-loeschen}

Links neben den Screens steht die Liste <span class="ui">Projects</span>, dieselbe Liste zeigt auch die Startseite. Jedes Projekt steht dort mit Gerät, Zeitpunkt des letzten Speicherns und, falls schon übertragen, mit dem Gerät, auf dem es läuft. Das offene Projekt ist hervorgehoben.

- Ein Klick öffnet ein Projekt, immer in seiner neuesten Version.
- <span class="ui">Rename</span> im Menü des Eintrags macht den Namen direkt in der Liste bearbeitbar. <kbd>Enter</kbd> bestätigt, <kbd>Esc</kbd> bricht ab. Mit <kbd>F2</kbd> geht es ebenso, wenn der Eintrag den Fokus hat. Die Versionen und die Zuordnung zum Gerät bleiben beim Umbenennen erhalten.
- <span class="ui">Delete</span> im Menü löscht ein Projekt mit allen seinen Versionen. Vorher fragt der Designer nach und sagt, wie viele Versionen wegfallen. Das Häkchen <span class="ui">Download latest version as a backup</span> ist gesetzt: Die neueste Version landet dann als Projektdatei in deinen Downloads, bevor gelöscht wird. Nimm es weg, wenn du nur aufräumst. Das offene Projekt lässt sich nicht löschen, öffne vorher ein anderes. Die Taste <kbd>Entf</kbd> löscht in der Liste nichts.

Das Menü öffnet sich über die drei Punkte, die beim Überfahren eines Eintrags erscheinen, oder mit einem Rechtsklick.

Das Symbol ganz rechts im Kopf der Liste klappt sie zu einem schmalen Streifen ein. Das hilft, wenn der Platz für grosse Screens knapp wird. Der Browser merkt sich, ob sie eingeklappt ist.

::: warning Löschen lässt sich nicht rückgängig machen
Ein gelöschtes Projekt ist mit allen Versionen weg, Rückgängig holt es nicht zurück. Geblieben ist dann nur die Datei aus dem Backup, falls das Häkchen gesetzt war. Mit <span class="ui">Upload Project</span> öffnest du sie wieder.
:::

## Als Datei sichern und öffnen

- <span class="ui">File</span> › <span class="ui">Download Project</span> lädt das Projekt als `<Name>_project.zip` herunter, mit allen Icons und Bildern und der Beschreibung des Geräts. Das ist die Datei zum Aufbewahren und Weitergeben.
- <span class="ui">File</span> › <span class="ui">Upload Project</span> öffnet so eine Datei wieder, auf der Startseite geht das über <span class="ui">Choose File...</span>. Eine hochgeladene Datei ist ein Projekt ohne Namen. Speicherst du sie, schlägt der Dialog den Namen aus der Datei vor. Gibt es den schon, fragt er, ob du ersetzen willst.
- <span class="ui">File</span> › <span class="ui">Export Project</span> lädt das Projekt in dem Format herunter, das ein Gerät liest. Das brauchst du nur, um ein Gerät von Hand zu bespielen. Zum Aufbewahren nimm <span class="ui">Download Project</span>.

## Projekteinstellungen

<span class="ui">Settings</span> öffnet <span class="ui">Project Settings</span> mit diesen Bereichen:

| Bereich | was du dort findest |
|---|---|
| <span class="ui">Project Properties</span> | den Namen des Projekts (nur zum Lesen), die Grösse der Screens (vom Gerät vorgegeben) und das Zahlenformat der [Platzhalter](/objekte/anzeigen#platzhalter) |
| <span class="ui">Device</span> | das Gerät und seine Drehung (<span class="ui">Rotation</span>), falls es sich drehen lässt |
| <span class="ui">Screens</span> | alle Screens in einer Liste: umbenennen, ordnen, Master zuweisen, löschen |
| <span class="ui">Assets</span> | alle Icons und Bilder des Projekts, siehe [Icons und Schriften](/designer/icons-schriften) |
| <span class="ui">Fonts</span> | die Schriften des Geräts, mit Vorschau |
| <span class="ui">Adornment</span> | den Gerätrahmen |
| <span class="ui">Snap Grid</span> | Hilfslinien, an denen Objekte beim Verschieben einrasten |
| <span class="ui">Topics</span> | die MQTT-Topics, siehe [MQTT-Topics](/designer/topics) |

Unter <span class="ui">Device</span> kannst du dem Projekt auch ein anderes Gerät geben (<span class="ui">Load Device</span>). Grösse, Farbtiefe, Rahmen, Tasten und Schriften kommen dann vom neuen Gerät. Deine Objekte bleiben, wo sie sind, und können danach ausserhalb des Screens liegen. Objekttypen, die das neue Gerät nicht kann, markiert der Designer mit einem orangen gestrichelten Rahmen. Speicherst du danach, läuft die Versionsgeschichte unter demselben Namen weiter.

Die Drehung unter <span class="ui">Rotation</span> sagt, wie das Gerät eingebaut ist. Bei 90 und 270 Grad tauschen Breite und Höhe.

<!-- handbuch-macke #10: Checkbox "Hardware supports Software Buttons" -->
Das Häkchen «Hardware supports Software Buttons» unter <span class="ui">Project Properties</span> setzt der Designer beim Anlegen passend zum Gerät. Es blendet nur den Bereich für Wischgesten in den Screen-Eigenschaften ein; lass es, wie es ist.

Den Namen änderst du nicht hier, sondern über <span class="ui">Rename</span> in der Projektliste oder mit <span class="ui">Save As...</span>.

<span class="ui">Number format</span> bestimmt, wie Platzhalter wie `{topic:…:N2}` Zahlen schreiben. Zur Wahl stehen <span class="ui">Switzerland</span> (`12'345.68`, der Standard), <span class="ui">Germany</span> (`12.345,68`), <span class="ui">Austria</span> (`12 345,68`) und <span class="ui">English</span> (`12,345.68`). Unter <span class="ui">Custom</span> trägst du Dezimal- und Tausendertrennzeichen selbst ein. Das Tausendertrennzeichen darf leer bleiben, die beiden Zeichen müssen sich aber unterscheiden.
