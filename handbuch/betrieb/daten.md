# Daten und Sicherung

Der Designer speichert alles in seinem eigenen Ordner, auf einem Pekaway-System unter `/home/pi/schaltli-designer`.

## Was wo liegt

| Pfad | Inhalt |
|---|---|
| `.data/projects/<id>/current.json` | der automatisch gespeicherte Stand jedes Projekts |
| `.data/projects/<id>/versions/` | die Stände der [Versionsgeschichte](/designer/versionen), höchstens 50 pro Projekt |
| `.data/projects/by-instance/` | welches Projekt auf welchem Gerät liegt |
| `.data/ddf/` | Beschreibungen von Geräten, die sich gemeldet haben oder hinzugefügt wurden |
| `.data/deploys/` | das zuletzt übertragene Projekt pro Gerät, zum Abholen durch das Gerät |
| `.data/firmware-uploads/` | Firmware-Dateien, die über <span class="ui">From file...</span> hochgeladen wurden |
| `.env.local` | Einstellungen des Designers |
| `firmware/bin/` | die mitgebrachte Firmware für die Geräte |

## Was du sichern solltest

Am wichtigsten sind deine Projekte. Am einfachsten sicherst du jedes mit <span class="ui">File</span> › <span class="ui">Download Project</span> als Datei. Eine solche Datei lässt sich auf jedem Designer wieder öffnen, auch nach einer Neuinstallation.

Willst du den ganzen Designer sichern, kopiere den Ordner `.data` und die Datei `.env.local`. `firmware/bin/` brauchst du nicht zu sichern, das Installationsskript lädt die Firmware bei jedem Lauf neu.

Selbst ohne Sicherung ist ein Projekt nicht verloren, solange es auf einem Gerät läuft: Jedes Gerät behält eine Kopie des zuletzt übertragenen Projekts, die du mit <span class="ui">Recover from Device...</span> zurückholst, siehe [Versionen und Wiederherstellen](/designer/versionen#vom-geraet-zurueckholen).

## Was ausserhalb liegt

Das Installationsskript legt ausserdem an:

- den Systemdienst `/etc/systemd/system/schaltli-designer.service`
- die nginx-Seite `/etc/nginx/sites-available/schaltli-designer`
- den WebSocket-Zugang `/etc/mosquitto/conf.d/schaltli-websockets.conf`
- die VanPi-Brücke als Tab in Node-RED, mit einer Sicherung der vorherigen Flows unter `~/.node-red/flows.pre_schaltli_bridge_<Zeitstempel>.json`

Diese Dateien richtet das Skript bei jedem Lauf wieder ein, sichern musst du sie nicht.

Die Einstellungen der Geräte selbst, also WLAN, Broker, Display, liegen auf den Geräten und nicht im Designer.
