# Designer ohne Pekaway

Der Designer braucht kein Pekaway. Er läuft auf jedem Rechner mit Node.js, zum Beispiel auf einem anderen Raspberry Pi oder einem Heimserver. Dir fehlt dann nur die VanPi-Brücke. Die Geräte zeigen also nur Werte an, die etwas anderes auf den Broker legt, etwa Home Assistant, Node-RED oder ein eigenes Skript.

## Was du brauchst

- Node.js 18.17 oder neuer und git
- Einen MQTT-Broker, den der Browser über WebSocket erreicht, auf demselben Rechner wie der Designer und auf Port 9001. Die Geräte sprechen ihn über den normalen Port 1883 an.

Bei Mosquitto reicht dafür eine zusätzliche Datei, etwa `/etc/mosquitto/conf.d/schaltli-websockets.conf`:

```
listener 9001
protocol websockets
allow_anonymous true
```

Starte Mosquitto danach neu. Ein blosses Neuladen genügt nicht, weil Mosquitto einen neuen Port nur beim Start öffnet.

## Installieren

```bash
git clone https://github.com/Matthias-Hess/schaltli-designer.git
cd schaltli-designer
echo "NEXT_PUBLIC_DEPLOY_ENABLED=true" > .env.local
npm ci
npm run build
npm run firmware:fetch
npm start
```

Schreib `.env.local` vor dem Build: Der Build liest die Einstellung ein, und ohne sie fehlen im Designer <span class="ui">Deploy to Device</span> und die Gerätesuche.

`npm run firmware:fetch` lädt die Firmware-Images, die zu diesem Stand des Designers gehören. Ohne sie funktioniert alles andere, nur Firmware-Updates über den Designer nicht.

Der Designer läuft danach auf Port 3000. Einen anderen Port wählst du mit der Umgebungsvariable `PORT`, zum Beispiel `PORT=8080 npm start`. Soll er beim Systemstart von selbst starten, richte einen Dienst ein. Das [Installationsskript für Pekaway](https://github.com/Matthias-Hess/schaltli-designer/blob/main/deploy/pekaway-install.sh) enthält eine systemd-Unit, die du als Vorlage nehmen kannst.

## Was anders ist als auf Pekaway

Die Bausteine im Designer, also Tank, Battery, Switch und Dimmer, suchen auf dem Broker nach den Werten, die die VanPi-Brücke unter `schaltli/state/…` ablegt. Findet der Designer dort nichts, bietet er Standardnamen an. Die Geräte zeigen dann erst etwas an, wenn jemand unter diesen Topics Werte veröffentlicht.

Die Geräte laden Projekte und Firmware direkt vom Designer herunter, über seine Adresse im lokalen Netz. Der Designer sucht sich dafür selbst eine private IPv4-Adresse aus und lässt VPN-Schnittstellen wie Tailscale oder WireGuard weg. Hat der Rechner mehrere Netzwerkanschlüsse, achte darauf, dass die Geräte ihn im WLAN erreichen.

## Aktualisieren

```bash
git pull
npm ci
npm run build
npm run firmware:fetch
```

Starte den Designer danach neu.
