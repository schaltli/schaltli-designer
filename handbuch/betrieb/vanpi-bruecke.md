# VanPi-Brücke

Die VanPi-Brücke verbindet Pekaway mit Schaltli. Pekaway kennt die Werte deines Vans, Schaltli liest sie vom MQTT-Broker. Die Brücke holt sie bei Pekaway ab und legt sie dort hin, wo Schaltli sie sucht. Befehle von Schaltli reicht sie in umgekehrter Richtung an Pekaway weiter.

Das [Installationsskript](/installieren/pekaway) richtet sie ein und bringt sie bei jedem Update auf den neuen Stand. Auf einem System ohne Pekaway tut es nichts.

## Wie sie arbeitet

Die Brücke ist ein eigener Tab «Schaltli VanPi Bridge» in Node-RED. Alle zwei Sekunden fragt sie Pekaways MQTT-Schnittstelle nach dem aktuellen Stand. Jeden Wert, der sich geändert hat, legt sie unter `schaltli/state/…` auf den Broker, und zwar «retained»: Er bleibt dort liegen, bis ein neuer kommt. Ein Gerät, das gerade einschaltet, kennt so sofort den aktuellen Stand.

Befehle an `schaltli/cmnd/…` übersetzt sie in Pekaways Befehle und fragt 300 Millisekunden später den neuen Stand ab. Ein Schalter auf einem Display zeigt deshalb kurz nach dem Antippen, was die Anlage tatsächlich getan hat. Einen Dimmerwert legt sie dagegen sofort als Stand ab, wie ihn auch Pekaways eigene Oberfläche gleich zeigt, und fragt erst nach, wenn keine Befehle mehr kommen: Pekaway speichert einen Dimmerwert erst kurz nach dem letzten Befehl. Meldet Pekaway danach etwas anderes, gilt das. Den ganzen Ablauf mit zwei Displays zeigt [MQTT an drei Beispielen](/designer/mqtt-beispiele#dimmer).

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
| `schaltli/state/dimmer/<n>/power` | `on`, sobald die Helligkeit über 0 liegt, sonst `off`; Pekaway meldet das nicht, die Brücke leitet es ab |
| `schaltli/state/dimmer/<n>/on_level` | die letzte Helligkeit über 0, auf die `on` zurückgeht |
| `schaltli/state/heater/power`, `…/target`, `…/status`, `…/temp`, `…/error`, `…/name` | Heizung |
| `schaltli/state/heater/mode` | `heat` oder `off`, dasselbe wie `…/power` in den Wörtern von Home Assistant; bei einer Autoterm auch `fan_only`, wenn sie nur lüftet |
| `schaltli/state/heater/preset` | nur bei einer Autoterm: `temperature`, wenn sie auf die Solltemperatur regelt, `power`, wenn sie mit fester Leistungsstufe heizt |
| `schaltli/state/heater/view` | welcher Regler der Heizung gerade zählt: `target` (heizt auf die Solltemperatur), `power` (heizt mit fester Leistung), `fan` (lüftet nur) oder `off`. Aus Betriebsart und Preset abgeleitet, für den Baustein «Heizung» |
| `schaltli/state/heater/timer` | Minuten, die ein Timer noch läuft, aufgerundet; `0` ohne Timer |
| `schaltli/state/heater/power_level`, `…/fan_level` | Leistungs- und Lüftungsstufe 1 bis 10 einer Autoterm |
| `schaltli/state/mppt/pv_volts`, `…/pv_amps`, `…/pv_watts`, `…/pv_total` | Solarladeregler |
| `schaltli/state/maxxfan/mode` | Dachlüfter: `off`, `manual` oder `auto` |
| `schaltli/state/maxxfan/hvac_mode` | dasselbe in den Wörtern eines Klimageräts bei Home Assistant: `off`, `fan_only` (von Hand) oder `auto` |
| `schaltli/state/maxxfan/power` | `on` oder `off`, ob er läuft |
| `schaltli/state/maxxfan/speed` | Drehzahl in Prozent, in Zehnern von 10 bis 100 |
| `schaltli/state/maxxfan/temperature` | Zieltemperatur im Automatikbetrieb, °C |
| `schaltli/state/maxxfan/cover` | Deckel `open` oder `closed` |
| `schaltli/state/maxxfan/airflow` | Luftrichtung `in` oder `out` |
| `schaltli/state/maxxfan/source` | woher die Werte stammen: `pekaway` oder `ble`, siehe [Dachlüfter](#dachlufter) |
| `schaltli/state/theme` | `light` oder `dark`, ob die Screens hell oder dunkel sind. Setzt die Brücke selbst, siehe unten. |

Welche davon es in deinem Van gibt, hängt davon ab, was an Pekaway angeschlossen ist.

## Die Befehle

| Topic | Nachricht | Wirkung |
|---|---|---|
| `schaltli/cmnd/relay/<n>` | `on`, `off`, `toggle` | Relais schalten |
| `schaltli/cmnd/wifirelay/<n>` | `on`, `off`, `toggle` | WLAN-Relais schalten |
| `schaltli/cmnd/dimmer/<n>` | `0` bis `100`, `on`, `off`, `toggle` | Dimmer stellen; `on` geht auf die letzte Helligkeit zurück, gab es noch keine, auf 70; `on` an einen brennenden Dimmer ändert nichts |
| `schaltli/cmnd/heater` | `on`, `off`, `toggle`, `heat`, bei einer Autoterm auch `fan_only` | Heizung ein- oder ausschalten, eine Autoterm auch nur lüften lassen |
| `schaltli/cmnd/heater/preset` | `temperature`, `power` | wie eine Autoterm heizt; läuft sie, stellt die Brücke sie gleich um |
| `schaltli/cmnd/heater/target` | `12` bis `35`, bei einer Autoterm bis `30` | Solltemperatur setzen, ohne die Heizung ein- oder auszuschalten |
| `schaltli/cmnd/heater/timer` | `1` bis `600`, `0` | Heizung so viele Minuten auf die Solltemperatur laufen lassen, eine Autoterm in ihrer Regelung; `0` schaltet sie aus |
| `schaltli/cmnd/heater/power_level` | `1` bis `10` | eine Autoterm mit dieser Stufe heizen lassen |
| `schaltli/cmnd/heater/fan_level` | `1` bis `10` | eine Autoterm mit dieser Stufe nur lüften lassen |
| `schaltli/cmnd/maxxfan/mode` | `off`, `manual` oder `fan_only`, `auto` | Dachlüfter aus, von Hand oder automatisch |
| `schaltli/cmnd/maxxfan/power` | `on`, `off` | Dachlüfter ein (im letzten Betrieb) oder aus |
| `schaltli/cmnd/maxxfan/speed` | `1` bis `100` | Drehzahl in Prozent, auf Zehner gerundet |
| `schaltli/cmnd/maxxfan/temperature` | `0` bis `37` | Zieltemperatur im Automatikbetrieb |
| `schaltli/cmnd/maxxfan/cover` | `open`, `closed` | Deckel öffnen oder schliessen |
| `schaltli/cmnd/maxxfan/airflow` | `in`, `out` | Luft hinein oder hinaus |
| `schaltli/cmnd/switchall` | `off` | alle Relais aus |
| `schaltli/cmnd/theme` | `light`, `dark`, `toggle` | Screens hell oder dunkel |

Andere Nachrichten ignoriert die Brücke.

Den Rest eines Timers meldet Pekaway erst ab Version 2.1.0, bei einer Autoterm auch schon vorher. Sonst zählt die Brücke selbst, ab dem Timer-Befehl, den sie weitergereicht hat. Schaltet jemand die Heizung aus, steht der Timer auf `0`. Startest du einen Timer anderswo als über die Brücke, etwa in Pekaways eigener Oberfläche, zählt sie nicht mit.

## Autoterm-Heizung {#autoterm}

Eine Autoterm kennt drei Betriebsarten, wie an ihrem eigenen Bedienteil: Sie regelt auf die Solltemperatur, sie heizt mit fester Leistungsstufe, oder sie lüftet nur. Pekaway meldet sie in einem eigenen Teil seiner Antwort, und die Brücke liest Zustand, Solltemperatur und Restzeit dann von dort.

Ihre Befehle schickt die Brücke nicht über MQTT, sondern über Pekaways HTTP-Schnittstelle im selben Node-RED, an `/autoterm/…`. Pekaways MQTT-Befehl für die Heizung erreicht eine Autoterm nicht, er schaltet nur eine andere Heizung wie Webasto oder China-Diesel. Im Temperaturmodus startet die Brücke sie mit der Solltemperatur, im Leistungsmodus mit der Leistungsstufe, beim Lüften mit der Lüftungsstufe. Dafür nimmt sie die letzte Stufe, die Pekaway gemeldet hat, sonst 5. Setzt du eine Stufe, schaltet die Heizung in diese Betriebsart, auch wenn sie gerade etwas anderes tat. Wählst du das Preset, während die Heizung aus ist, merkt sich die Brücke es für das nächste Einschalten.

Mit der Solltemperatur ist es ähnlich. Regelt die Autoterm gerade darauf, startet die Brücke sie mit der neuen gleich noch einmal, wie es Pekaways Knopf «Start Tempmode» tut. Ist sie aus, oder heizt sie mit fester Leistung, kann Pekaway die Solltemperatur nicht setzen, ohne sie einzuschalten. Die Brücke behält sie dann selbst, zeigt sie unter `schaltli/state/heater/target` und schickt sie beim nächsten Start mit. Stellst du in der Zwischenzeit in Pekaways Oberfläche eine andere ein, gilt die. Ein Neustart von Node-RED vergisst eine solche Solltemperatur. Pekaway nimmt für eine Autoterm höchstens 30 °C an, mehr lässt die Brücke dann nicht zu.

## Dachlüfter {#dachlufter}

Den MaxxFan kennt die Brücke in zwei Formen. Steuert Pekaway ihn, kommen seine Werte von Pekaway. Läuft im Van der BLE-Flow aus `vanpi-custom`, meldet der Lüfter selbst, wie er steht. Sobald die Brücke einmal vom BLE-Flow gehört hat, liest sie nur noch ihn, bis Node-RED neu startet, und `schaltli/state/maxxfan/source` steht auf `ble`. Befehle an `schaltli/cmnd/maxxfan/…` setzt dann der BLE-Flow um, nicht Pekaway. Das kann er ab dem Stand von `vanpi-custom` vom Oktober 2026; einen älteren Flow spielst du mit `merge_flow.py --update` neu ein, wie im README von `vanpi-custom` beschrieben.

Ohne BLE-Flow macht die Brücke aus jedem Befehl, was Pekaway versteht. Drehzahl und Temperatur gibt sie als Wert weiter, Pekaway stellt sie Stufe um Stufe ein. Betriebsart, Deckel und Luftrichtung kennt Pekaway nur als Umschalten. Die Brücke schaltet deshalb um, wo der gemeldete Stand vom gewünschten abweicht. Den Deckel bewegt Pekaway im Automatikbetrieb nicht.

Der Baustein «MaxxFan» bringt alles mit. Oben stehen die Knöpfe «Aus», «Hand» und «Auto», darunter der Deckel. Dann kommt, was nur bei laufendem Lüfter zählt: im Automatikbetrieb die Zieltemperatur, von Hand die Drehzahl von 10 bis 100 in Zehnern, und in beiden Fällen die Luftrichtung. Ist der Lüfter aus, bleibt dieser Teil leer. Was dort steht, wählt ein Switcher im Baustein, siehe [Teile je nach Betrieb](/designer/bausteine#je-nach-betrieb).

::: warning Ohne BLE-Flow zeigt der Screen, was Pekaway glaubt
<!-- handbuch-macke #32: MaxxFan ohne BLE-Flow meldet keinen echten Zustand -->
Pekaway schickt dem Lüfter seine Befehle und hört nichts zurück. Bedienst du den Lüfter mit seiner eigenen Fernbedienung, wissen Pekaway und deine Screens davon nichts. Ein Befehl zum Umschalten kann danach das Gegenteil bewirken. Schalte den Lüfter dann einmal über einen Screen in den Stand, den er wirklich hat.
:::

## Was sie ankündigt {#ankuendigung}

Damit der Designer die Werte als [Bausteine](/designer/bausteine) anbietet, kündigt die Brücke sie im Discovery-Format von Home Assistant an: für jedes Ding eine Beschreibung unter `homeassistant/…/config`, retained, alle unter dem Gerät «VanPi».

Den Dachlüfter, die Heizung und das Theme beschreibt sie zusätzlich als ganze Bausteine, unter `schaltli/blocks/maxxfan/config`, `schaltli/blocks/heater/config` und `schaltli/blocks/theme/config`. Im Block-Menü stehen dann «MaxxFan», die Heizung und «Theme» als je ein Baustein. Beim Theme tragen die Knöpfe «Hell» mit einer Sonne und «Dunkel» mit einem Mond. Die einzelnen Einträge, die sie ersetzen, fallen weg: beim Lüfter das Klimagerät, der Deckel und die Luftrichtung, bei der Heizung das Klimagerät und die beiden Stufen, beim Theme der Schalter. Der Timer der Heizung bleibt ein eigener Eintrag.

| Baustein | Teile |
|---|---|
| «MaxxFan» | Betriebsart (Aus, Hand, Auto); Deckel (Offen, Zu); im Automatikbetrieb die Zieltemperatur 0 bis 37 °C, von Hand die Drehzahl 10 bis 100, in beiden die Luftrichtung (Rein, Raus) |
| die Heizung | Betriebsart (Aus, Heizen, bei einer Autoterm auch Lüften); beim Heizen die Regelung (Temperatur, Leistung) und je nachdem die Solltemperatur 12 bis 35 °C (bei einer Autoterm bis 30 °C) oder die Leistungsstufe 1 bis 10; beim Lüften die Lüftungsstufe 1 bis 10; die Raumtemperatur |

Welcher Regler der Heizung gerade gilt, steht in `schaltli/state/heater/view`. Home Assistant sieht von diesen Bausteinen nichts, er bekommt weiter die einzelnen Dinge.

| Ding | angekündigt als | Name |
|---|---|---|
| jeder Tank | Messwert in Prozent | der Name aus Pekaway |
| die Batterie | Ladezustand in Prozent | «Batterie» |
| jedes Relais und jedes WLAN-Relais | Schalter, `on` und `off` | der Name aus Pekaway |
| jeder Dimmer | Licht mit Ein-Aus und Helligkeit 0 bis 100; der Ein-Aus-Zustand kommt aus der Helligkeit | der Name aus Pekaway |
| die Heizung | Klimagerät mit Betriebsart `heat` oder `off`, Solltemperatur 12 bis 35 °C und der Raumtemperatur des Fühlers, den Pekaway der Heizung zuordnet; bei einer Autoterm zusätzlich `fan_only` und die Presets `temperature` und `power`, Solltemperatur bis 30 °C | der Name aus Pekaway, sonst «Heizung» |
| ihr Timer | Zahl 0 bis 600 Minuten | ihr Name und «Timer» |
| ihre Leistungs- und Lüftungsstufe, nur bei Autoterm | je eine Zahl 1 bis 10 | ihr Name und «Leistung» bzw. «Lüftung» |
| der Dachlüfter | Klimagerät mit Betriebsart `off`, `fan_only` (von Hand) oder `auto`, Zieltemperatur 0 bis 37 °C und den Gebläsestufen `10` bis `100` | «MaxxFan» |
| sein Deckel | Schalter, `open` an, `closed` aus | «MaxxFan Deckel» |
| seine Luftrichtung | Schalter, `out` an, `in` aus | «MaxxFan Luftrichtung» |
| das Theme | Schalter, `dark` an, `light` aus | «Theme» |

Angekündigt wird, was Pekaway meldet. Pekaway meldet alle vier Tanks und alle acht Relais, auch die, an denen nichts hängt. Die stehen mit Pekaways Standardnamen im Block-Menü, etwa «Level 3» oder «Relay 7». Gib ihnen in Pekaway einen Namen, oder lass sie im Menü einfach stehen. Benennst du ein Ding in Pekaway um, kündigt die Brücke es mit dem neuen Namen an. Meldet Pekaway ein Ding nicht mehr, nimmt sie die Ankündigung zurück.

Temperaturfühler, Batteriemanagement und Solarladeregler kündigt sie noch nicht an. Ihre Werte liegen trotzdem unter `schaltli/state/…`, und du bindest sie von Hand, siehe [Topics](/designer/topics).

Läuft auf demselben Broker ein Home Assistant, sieht er dasselbe: ein Gerät «VanPi» mit allen angekündigten Dingen. Was du dort schaltest, geht als Befehl an `schaltli/cmnd/…` und kommt über die Brücke bei Pekaway an.

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
