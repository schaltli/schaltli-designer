# MQTT-Broker und Topics

Schaltli bringt keinen eigenen Broker mit. Es benutzt den Mosquitto, der auf jedem Pekaway-System schon läuft.

## Zwei Zugänge zum selben Broker

- **Port 1883**, normales MQTT: Hier sprechen die Geräte, die VanPi-Brücke und alles andere auf dem Pekaway-System.
- **Port 9001**, MQTT über WebSocket: Hier spricht der Browser, also der Designer. Ein Browser kann nicht direkt über 1883 sprechen. Das [Installationsskript](/installieren/pekaway) richtet diesen Zugang mit der Datei `/etc/mosquitto/conf.d/schaltli-websockets.conf` ein.

Beide Zugänge verlangen keine Anmeldung, genau wie der Broker auf Pekaway ohnehin.

## Topics

Alle Topics von Schaltli beginnen mit `schaltli/`.

**Werte und Befehle der Anlage**

| Topic | Bedeutung |
|---|---|
| `schaltli/state/…` | Zustand der Anlage, bleibt auf dem Broker liegen («retained») |
| `schaltli/cmnd/…` | Befehle, bleiben nicht liegen |

Welche es gibt, steht unter [VanPi-Brücke](/betrieb/vanpi-bruecke).

**Pro Gerät,** unter `schaltli/<Kennung>/`, wobei die Kennung etwa `waveshare-touch-lcd-4v3b-0a1b2c3d4e5f` lautet:

| Topic | Bedeutung |
|---|---|
| `…/hello` | wer das Gerät ist: Gerätetyp, Firmware, Adresse seiner Beschreibung. Bleibt liegen. |
| `…/status` | `online` oder `offline`. Geht ein Gerät unerwartet vom Netz, setzt der Broker `offline`. |
| `…/deploy` | ein neues Projekt für das Gerät, vom Designer. Bleibt liegen, bis das Gerät es abholt. |
| `…/deploy-status` | Fortschritt einer Übertragung |
| `…/firmware` | eine neue Firmware für das Gerät, vom Designer |

## Mithören {#mithoeren}

Auf dem Pekaway-System zeigt dieser Befehl alles, was bei Schaltli passiert:

```bash
mosquitto_sub -h localhost -t 'schaltli/#' -v
```

So siehst du, ob die VanPi-Brücke Werte liefert, ob sich ein Gerät meldet und was ein Schalter schickt.

## Ein anderer Broker

Du kannst Schaltli auch mit einem anderen Broker betreiben, siehe [Ohne Pekaway](/installieren/ohne-pekaway). Er braucht dann ebenfalls einen WebSocket-Zugang auf Port 9001, auf demselben Rechner wie der Designer. Die Geräte trägst du in ihrer [Einrichtung](/geraete/einrichten) auf diesen Broker um.
