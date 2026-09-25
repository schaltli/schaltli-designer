# Daten und Sicherung

Der Designer speichert alles in seinem eigenen Ordner, auf einem Pekaway-System unter `/home/pi/schaltli-designer`.

## Was wo liegt

| Pfad | Inhalt |
|---|---|
| `.data/projects/<Name>/versions/` | die [Versionen](/designer/versionen) eines Projekts, eine Datei pro Speichern, höchstens 20 |
| `.data/projects/<Name>/latest.json` | die neueste Version in Kürze, für die Projektliste |
| `.data/projects/<Name>/deploys.json` | welche Version auf welches Gerät übertragen wurde |
| `.data/blobs/` | Schriften, Bilder und Gerätebeschreibungen der Projekte, jede nur einmal abgelegt |
| `.data/by-instance/` | welches Projekt auf welchem Gerät liegt |
| `.data/ddf/` | Beschreibungen von Geräten, die sich gemeldet haben oder hinzugefügt wurden |
| `.data/deploys/` | das zuletzt übertragene Projekt pro Gerät, zum Abholen durch das Gerät |
| `.data/firmware-uploads/` | Firmware-Dateien, die über <span class="ui">From file...</span> hochgeladen wurden |
| `.env.local` | Einstellungen des Designers |
| `firmware/bin/` | die mitgebrachte Firmware für die Geräte |

## Was du sichern solltest

Am wichtigsten sind deine Projekte. Am einfachsten sicherst du jedes mit <span class="ui">File</span> › <span class="ui">Download Project</span> als Datei. Eine solche Datei lässt sich auf jedem Designer wieder öffnen, auch nach einer Neuinstallation.

Jedes Projekt ist ein Ordner mit seinem Namen. Eine Version speichert nur das Design, meist einige KB. Schriften, Bilder und die Gerätebeschreibung, die zusammen mehrere MB ausmachen, liegen einmal unter `.data/blobs/`, nicht in jeder Version. Der Designer schreibt jede Datei zuerst daneben und benennt sie erst dann um. So hinterlässt ein Stromausfall mitten im Speichern keine halbe Datei.

Willst du den ganzen Designer sichern, kopiere den Ordner `.data` und die Datei `.env.local`. `firmware/bin/` brauchst du nicht zu sichern, das Installationsskript lädt die Firmware bei jedem Lauf neu. Einzelne Projekte lassen sich nicht sinnvoll aus `.data/projects` herauskopieren, weil ihre Schriften und Bilder in `.data/blobs/` liegen. Dafür gibt es <span class="ui">Download Project</span>.

Ordner in `.data/projects`, deren Name eine lange Kennung wie `0368fc67-d5ca-4f7c-9968-7cd0401be4bd` ist, stammen von Designer-Versionen vor September 2026, die automatisch gespeichert haben. Der Designer beachtet sie nicht mehr. Du kannst sie löschen.

Selbst ohne Sicherung ist ein Projekt nicht verloren, solange es auf einem Gerät läuft: Jedes Gerät behält eine Kopie des zuletzt übertragenen Projekts, die du mit <span class="ui">Recover from Device...</span> zurückholst, siehe [Versionen und Wiederherstellen](/designer/versionen#vom-geraet-zurueckholen).

## Was ausserhalb liegt

Das Installationsskript legt ausserdem an:

- den Systemdienst `/etc/systemd/system/schaltli-designer.service`
- die nginx-Seite `/etc/nginx/sites-available/schaltli-designer`
- den WebSocket-Zugang `/etc/mosquitto/conf.d/schaltli-websockets.conf`
- die VanPi-Brücke als Tab in Node-RED, mit einer Sicherung der vorherigen Flows unter `~/.node-red/flows.pre_schaltli_bridge_<Zeitstempel>.json`

Diese Dateien richtet das Skript bei jedem Lauf wieder ein, sichern musst du sie nicht.

Die Einstellungen der Geräte selbst, also WLAN, Broker, Display, liegen auf den Geräten und nicht im Designer.
