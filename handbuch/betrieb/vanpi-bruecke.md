# VanPi-Brücke

Die VanPi-Brücke verbindet Pekaway mit Schaltli. Pekaway kennt die Werte deines Vans, Schaltli liest sie vom MQTT-Broker. Die Brücke holt sie bei Pekaway ab und legt sie dort hin, wo Schaltli sie sucht. Befehle von Schaltli reicht sie in umgekehrter Richtung an Pekaway weiter.

Das [Installationsskript](/installieren/pekaway) richtet sie ein und bringt sie bei jedem Update auf den neuen Stand. Auf einem System ohne Pekaway tut es nichts.

## Wie sie arbeitet

Die Brücke ist ein eigener Tab «Schaltli VanPi Bridge» in Node-RED. Alle zwei Sekunden fragt sie Pekaways MQTT-Schnittstelle nach dem aktuellen Stand. Jeden Wert, der sich geändert hat, legt sie unter `schaltli/state/…` auf den Broker, und zwar «retained»: Er bleibt dort liegen, bis ein neuer kommt. Ein Gerät, das gerade einschaltet, kennt so sofort den aktuellen Stand.

Befehle an `schaltli/cmnd/…` übersetzt sie in Pekaways Befehle und fragt 300 Millisekunden später den neuen Stand ab. Ein Schalter auf einem Display zeigt deshalb kurz nach dem Antippen, was die Anlage tatsächlich getan hat. Den ganzen Ablauf mit zwei Displays zeigt [MQTT an drei Beispielen](/designer/mqtt-beispiele#dimmer).

## Die Werte

| Topic | Inhalt |
|---|---|
| `schaltli/state/tank/<n>/level`, `…/name` | Füllstand in Prozent und Name des Tanks |
| `schaltli/state/battery/voltage`, `…/current`, `…/soc` | Spannung, Strom, Ladezustand in Prozent |
| `schaltli/state/bms/voltage`, `…/current`, `…/soc`, `…/capacity`, `…/cell/<n>` | Werte des Batteriemanagements, bis 16 Zellen |
| `schaltli/state/temp/<n>/value`, `…/name` | Temperaturfühler |
| `schaltli/state/relay/<n>/power`, `…/name` | Relais 1 bis 8, `on` oder `off` |
| `schaltli/state/wifirelay/<n>/power`, `…/name` | WLAN-Relais 1 bis 8 |
| `schaltli/state/dimmer/<n>/level`, `…/name` | Dimmer 1 bis 8, Helligkeit 0 bis 100 |
| `schaltli/state/heater/power`, `…/target`, `…/status`, `…/temp`, `…/error` | Heizung |
| `schaltli/state/mppt/pv_volts`, `…/pv_amps`, `…/pv_watts`, `…/pv_total` | Solarladeregler |
| `schaltli/state/maxxfan/power`, `…/speed`, `…/direction`, `…/temp`, `…/auto`, `…/vent` | Dachlüfter |
| `schaltli/state/theme` | `light` oder `dark`, ob die Screens hell oder dunkel sind. Setzt die Brücke selbst, siehe unten. |

Welche davon es in deinem Van gibt, hängt davon ab, was an Pekaway angeschlossen ist. Die [Bausteine](/designer/bausteine) im Designer zeigen nur, was wirklich da ist.

## Die Befehle

| Topic | Nachricht | Wirkung |
|---|---|---|
| `schaltli/cmnd/relay/<n>` | `on`, `off`, `toggle` | Relais schalten |
| `schaltli/cmnd/wifirelay/<n>` | `on`, `off`, `toggle` | WLAN-Relais schalten |
| `schaltli/cmnd/dimmer/<n>` | `0` bis `100`, `on`, `off`, `toggle` | Dimmer stellen |
| `schaltli/cmnd/heater` | `on`, `off`, `toggle` | Heizung ein- oder ausschalten |
| `schaltli/cmnd/heater/target` | `12` bis `35` | Solltemperatur setzen, ohne die Heizung ein- oder auszuschalten |
| `schaltli/cmnd/switchall` | `off` | alle Relais aus |
| `schaltli/cmnd/theme` | `light`, `dark`, `toggle` | Screens hell oder dunkel |

Andere Nachrichten ignoriert die Brücke.

## Hell und dunkel

Ob die Screens hell oder dunkel sind, weiss Pekaway nicht, das merkt sich die Brücke selbst. Einen Befehl an `schaltli/cmnd/theme` reicht sie nicht an Pekaway weiter. Sie legt stattdessen `schaltli/state/theme` auf den Broker, retained wie alle anderen Werte. `toggle` wechselt zum jeweils anderen Wert. Wurde noch nie umgeschaltet, gilt hell, und das erste `toggle` macht dunkel. Nach einem Neustart von Node-RED liest die Brücke den Wert, der auf dem Broker liegt, und macht dort weiter.

Ohne VanPi-Brücke setzt niemand diesen Wert. Wer seine Anlage anders anbindet, etwa mit Home Assistant, legt `schaltli/state/theme` selbst retained auf den Broker. Mehr unter [Themes](/designer/themes#hell-und-dunkel).

## Wenn keine Werte kommen

Nach einem Pekaway-Update, das die Node-RED-Flows ersetzt, fehlt die Brücke. Führe das Installationsskript noch einmal aus, es richtet sie wieder ein.

Von Hand steuerst du die Brücke mit dem Skript im Designer-Ordner:

```bash
cd /home/pi/schaltli-designer
node scripts/install-vanpi-bridge.js --verify     # einrichten und warten, bis Werte kommen
node scripts/install-vanpi-bridge.js --uninstall  # wieder entfernen
```

Bevor es etwas ändert, sichert das Skript alle Node-RED-Flows nach `~/.node-red/flows.pre_schaltli_bridge_<Zeitstempel>.json`. Pekaways eigene Flows fasst es nicht an, es fügt nur seinen einen Tab hinzu oder ersetzt ihn.
