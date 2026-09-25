# Projekte

Ein Projekt enthält alles, was auf ein Gerät kommt: die Screens mit ihren Objekten, die Topics, die Icons und Bilder. Es gehört immer zu genau einem Gerätetyp.

## Ein neues Projekt

Die Startseite <span class="ui">Welcome to Schaltli</span> zeigt alle Geräte, für die du ein Projekt anlegen kannst:

- <span class="ui">Server DDFs</span>: die Geräte, die der Designer mitbringt.
- <span class="ui">Announced Devices</span>: Geräte, die sich gerade beim Broker melden, auch Android-Handys.
- Geräte, die sich früher gemeldet haben und gerade nicht online sind, blendet ein Link darunter ein.

Ein Klick wählt ein Gerät, <span class="ui">Create Project</span> legt das Projekt an. Ein Doppelklick erledigt beides auf einmal.

Ein neues Projekt hat einen Master-Screen «Master 1» und einen Screen «Screen 1», der diesen Master verwendet. Grösse, Farbtiefe, Schriften und Gerätrahmen kommen vom Gerät.

Über das Feld <span class="ui">Add</span> oben auf der Startseite fügst du ein Gerät hinzu, dessen Beschreibung (eine `.ddf.zip`-Datei) im Internet liegt.

## Speichern

Der Designer speichert jede Änderung nach drei Sekunden von selbst, auf dem Rechner, auf dem er läuft. Öffnest du ihn wieder im selben Browser, fragt er <span class="ui">Continue where you left off?</span> und bietet <span class="ui">Restore Project</span> an.

::: warning Der Browser merkt sich nur ein Projekt
Die automatische Sicherung kennt nur das zuletzt bearbeitete Projekt dieses Browsers. Eine Liste deiner Projekte gibt es nicht. Wer mehrere Projekte hat oder den Browser wechselt, sichert sie mit <span class="ui">Download Project</span> als Datei.
:::

## Als Datei sichern und öffnen

- <span class="ui">File</span> › <span class="ui">Download Project</span> lädt das Projekt als `<Name>_project.zip` herunter, mit allen Icons und Bildern und der Beschreibung des Geräts. Das ist die Datei zum Aufbewahren und Weitergeben.
- <span class="ui">File</span> › <span class="ui">Upload Project</span> öffnet so eine Datei wieder. Auf der Startseite geht das auch über <span class="ui">Choose File...</span>.
- <span class="ui">File</span> › <span class="ui">Export Project</span> lädt das Projekt in dem Format herunter, das ein Gerät liest. Das brauchst du nur, um ein Gerät von Hand zu bespielen. Zum Aufbewahren nimm <span class="ui">Download Project</span>.
- <span class="ui">File</span> › <span class="ui">New Project</span> fragt nach und führt zurück zur Startseite.

## Projekteinstellungen

<span class="ui">Settings</span> öffnet <span class="ui">Project Settings</span> mit diesen Bereichen:

| Bereich | was du dort findest |
|---|---|
| <span class="ui">Project Properties</span> | den Namen des Projekts und die Grösse der Screens (vom Gerät vorgegeben) |
| <span class="ui">Device</span> | das Gerät und seine Drehung (<span class="ui">Rotation</span>), falls es sich drehen lässt |
| <span class="ui">Screens</span> | alle Screens in einer Liste: umbenennen, ordnen, Master zuweisen, löschen |
| <span class="ui">Assets</span> | alle Icons und Bilder des Projekts, siehe [Icons und Schriften](/designer/icons-schriften) |
| <span class="ui">Fonts</span> | die Schriften des Geräts, mit Vorschau |
| <span class="ui">Adornment</span> | den Gerätrahmen |
| <span class="ui">Snap Grid</span> | Hilfslinien, an denen Objekte beim Verschieben einrasten |
| <span class="ui">Topics</span> | die MQTT-Topics, siehe [MQTT-Topics](/designer/topics) |

Unter <span class="ui">Device</span> kannst du dem Projekt auch ein anderes Gerät geben (<span class="ui">Load Device</span>). Grösse, Farbtiefe, Rahmen, Tasten und Schriften kommen dann vom neuen Gerät. Deine Objekte bleiben, wo sie sind, und können danach ausserhalb des Screens liegen. Objekttypen, die das neue Gerät nicht kann, markiert der Designer mit einem orangen gestrichelten Rahmen.

Die Drehung unter <span class="ui">Rotation</span> sagt, wie das Gerät eingebaut ist. Bei 90 und 270 Grad tauschen Breite und Höhe.

<!-- handbuch-macke #10: Checkbox "Hardware supports Software Buttons" -->
Das Häkchen «Hardware supports Software Buttons» unter <span class="ui">Project Properties</span> setzt der Designer beim Anlegen passend zum Gerät. Es blendet nur den Bereich für Wischgesten in den Screen-Eigenschaften ein; lass es, wie es ist.

Löschen kannst du ein Projekt im Designer nicht. Umbenennen geht unter <span class="ui">Project Properties</span>.
