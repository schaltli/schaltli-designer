# Designer auf Pekaway installieren

Der Designer läuft auf deinem Pekaway-System, neben allem, was dort schon läuft. Ein Skript erledigt die Installation, und dasselbe Skript holt später auch die Updates.

## Voraussetzungen

Ein übliches Pekaway-Image bringt alles mit. Das Skript prüft trotzdem zuerst, ob Folgendes vorhanden ist, und bricht mit einer Meldung ab, wenn etwas fehlt. Es installiert nichts davon selbst.

- Node.js und npm
- git
- nginx und Mosquitto als Systemdienste
- `sudo` ohne Passwort für den Benutzer, der das Skript startet

## Installieren

Melde dich per SSH als Benutzer `pi` an und führe diesen Befehl aus:

```bash
curl -fsSL https://raw.githubusercontent.com/Matthias-Hess/schaltli-designer/main/deploy/pekaway-install.sh | bash
```

Setze kein `sudo` davor. Das Skript ruft `sudo` selbst auf, und zwar nur für die Schritte, die es braucht. Die Installation dauert einige Minuten, der Grossteil davon ist der Build.

::: warning Beim ersten Mal zweimal ausführen
<!-- handbuch-macke: .env.local wird erst nach dem Build geschrieben -->
Bei einer frischen Installation fehlt danach der Menüpunkt <span class="ui">Deploy to Device</span> im Designer, ebenso die Gerätesuche auf der Startseite. Der Schalter, der beides freigibt, wird erst nach dem Build gesetzt, und der Build hat ihn deshalb noch nicht gesehen. Führe den Befehl ein zweites Mal aus. Danach ist alles da.
:::

## Was das Skript verändert

Das Skript fügt nur hinzu. Bestehende nginx-Seiten, Dienste und Mosquitto-Einstellungen fasst es nicht an.

1. Es klont den Designer nach `/home/pi/schaltli-designer`, installiert die Abhängigkeiten und baut ihn.
2. Es lädt die Firmware-Images für die Geräte herunter und prüft ihre Prüfsummen. Klappt das nicht, läuft der Designer trotzdem. Er bietet dann nur keine Firmware-Updates an, bis ein späterer Lauf die Images holt.
3. Es richtet die [VanPi-Brücke](/einfuehrung/#die-vier-teile) in Node-RED ein. Vorher sichert es alle bestehenden Flows nach `~/.node-red/flows.pre_schaltli_bridge_<Zeitstempel>.json`. Danach wartet es, bis die ersten Werte der Anlage auf dem Broker liegen.
4. Es schreibt `.env.local` mit `NEXT_PUBLIC_DEPLOY_ENABLED=true`, aber nur, wenn die Datei noch nicht existiert. Eigene Änderungen daran bleiben erhalten.
5. Es legt den Systemdienst `schaltli-designer` an. Der startet den Designer auf Port 3000, nach jedem Neustart des Systems und nach einem Absturz.
6. Es legt eine nginx-Seite für `schaltli.peka.way` an, die auf Port 3000 weiterleitet.
7. Es gibt Mosquitto einen zusätzlichen Zugang über WebSocket auf Port 9001. Den braucht der Browser, denn er kann nicht direkt über den normalen MQTT-Port 1883 sprechen. Die Geräte bleiben bei 1883.

::: info Kurze MQTT-Unterbrechung
Damit Mosquitto den neuen Port 9001 übernimmt, startet das Skript ihn beim ersten Mal neu. Für ein paar Sekunden sind alle MQTT-Verbindungen weg, auch die von anderen Diensten wie zigbee2mqtt. Sie verbinden sich von selbst wieder.
:::

## Den Designer öffnen

Öffne im Browser:

```
http://<IP-deines-Pekaway-Systems>:3000
```

::: warning schaltli.peka.way funktioniert noch nicht
<!-- handbuch-macke: schaltli.peka.way löst nicht auf -->
Am Ende meldet das Skript `http://schaltli.peka.way/`. Für diesen Namen gibt es aber noch keinen DNS-Eintrag, der Browser findet ihn also nicht. Nimm die IP-Adresse mit Port 3000.
:::

Der Designer spricht den Broker unter derselben Adresse an, auf Port 9001. Öffnest du den Designer also über die IP des Pekaway-Systems, findet er auch den Broker.

## Prüfen, was installiert ist

```bash
curl http://<IP-deines-Pekaway-Systems>:3000/api/version
```

Die Antwort nennt drei Dinge: den Stand des Designers, die Systemgeneration, die Designer und Firmware gemeinsam haben müssen, und die Firmware-Version, die dieser Designer mitbringt. Dieselbe Zeile steht unten im Dialog <span class="ui">Deploy to Device</span>.

## Aktualisieren

Führe denselben Befehl wie bei der Installation noch einmal aus. Das Skript holt den neuen Stand, baut neu, lädt die passende Firmware, bringt die VanPi-Brücke auf den neuen Stand und startet den Dienst neu.

Hast du im Ordner `/home/pi/schaltli-designer` selbst Dateien geändert, bricht das Skript ab, statt deine Änderungen zu überschreiben. Mit `git status` in diesem Ordner siehst du, welche es sind.

::: tip Pekaway-Update
Ersetzt ein Pekaway-Update die Node-RED-Flows, ist die VanPi-Brücke weg, und die Geräte bekommen keine neuen Werte mehr. Führe dann das Installationsskript noch einmal aus, es richtet die Brücke wieder ein.
:::
