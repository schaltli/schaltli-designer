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
| `schaltli/state/heater/state_text` | nur bei einer Autoterm: was sie tut, in Worten: «Bereit», «Startet», «Heizt», «Lüftet», «Kühlt ab» oder «Störung» |
| `schaltli/state/heater/fault` | nur bei einer Autoterm: eine Störung in Worten, etwa «Störung: Keine Zündung»; leer, solange keine da ist, siehe [Störungen](#storungen) |
| `schaltli/state/heater/status_line` | nur bei einer Autoterm: die Störung, solange es eine gibt, sonst der Zustand. Die Zeile oben im Baustein |
| `schaltli/state/heater/voltage`, `…/fan_rpm`, `…/pump_hz` | nur bei einer Autoterm: Spannung, wie sie sie misst, Drehzahl des Gebläses und Frequenz der Brennstoffpumpe |
| `schaltli/state/heater/diag_text` | nur bei einer Autoterm: Heizungstemperatur, Drehzahl und Pumpe in einer Zeile, etwa «40 °C · 3600 rpm · 1.6 Hz» |
| `schaltli/state/heater/runtime`, `…/runtime_left`, `…/timer_on` | nur bei einer Autoterm: eingestellte und verbleibende Laufzeit in Minuten, und `on`, solange ein Timer läuft |
| `schaltli/state/heater/fuel`, `…/fuel_since`, `…/fuel_text` | nur bei einer Autoterm: verbrauchter Diesel in Litern, seit wann, und beides als Zeile wie «2.100 l seit 05.12.2024 18:00h», siehe [Verbrauch](#verbrauch) |
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
| `schaltli/cmnd/heater/view` | `off`, `target`, `power`, `fan` | eine Autoterm aus, auf die Solltemperatur, mit fester Leistung oder nur lüften lassen, in einem Wort |
| `schaltli/cmnd/heater/timer_on` | `on`, `off` | den Timer einer Autoterm ein (eine Stunde) oder aus (ohne Ende weiterlaufen) |
| `schaltli/cmnd/heater/runtime` | `0` bis `600` | die Laufzeit einer Autoterm in Minuten neu setzen, ohne die Betriebsart zu ändern, auf 15 Minuten gerundet, mindestens 15; `0` läuft ohne Ende weiter |
| `schaltli/cmnd/heater/fuel` | `reset` | den Verbrauch einer Autoterm auf null setzen, ab jetzt |
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

Für die Laufzeit gibt es einen Timer wie bei einer Eieruhr. Schaltest du ihn ein, läuft die Heizung eine Stunde, und mit `schaltli/cmnd/heater/runtime` stellst du bis zu 600 Minuten ein, in Schritten von 15 Minuten. Andere Werte nimmt Pekaway nicht an: Es rundet selbst, und aus 5 Minuten würde 0, das den Countdown abbricht. Die Brücke rundet deshalb vorher, und alles über 0 wird mindestens 15. Ziehst du am Laufzeit-Dial, schickt sie erst den Wert, bei dem du eine halbe Sekunde stehen bleibst, und nicht jeden Zwischenwert. Pekaway zählt herunter und schaltet am Ende aus. Schaltest du ihn aus, läuft sie ohne Ende weiter. Um die Laufzeit neu zu setzen, startet die Brücke die Autoterm in ihrer Betriebsart noch einmal. Ist die Heizung aus, behält die Brücke Timer und Laufzeit wie die Solltemperatur und schickt sie beim nächsten Start mit. Pekaway würde den Countdown sonst sofort beginnen, auch bei ausgeschalteter Heizung. Den Wochenplan aus Pekaways Oberfläche kennt die Brücke nicht. Startet er die Heizung, zeigen deine Screens sie laufen, aber nicht, warum.

### Störungen {#storungen}

Eine Störung soll nicht still bleiben. Unter `schaltli/state/heater/fault` steht deshalb eine, sobald es eine gibt, und sonst nichts:

- was die Heizung meldet: «Keine Zündung», «Kein Brennstoff? Neuer Versuch», «Flammabriss» oder «Unbekannter Zustand der Heizung», so wie Pekaway es bei der 2D in Worte fasst,
- ein Befehl, den Pekaway abgelehnt oder nicht beantwortet hat, etwa «Störung: Befehl nicht angenommen (keine Antwort von Pekaway)». Das bleibt stehen, bis ein Befehl wieder angenommen wird,
- ein Start, dem die Heizung nicht folgt: Steht sie 90 Sekunden nach dem Start noch auf «Bereit», heisst es «Störung: Heizung folgt dem Start nicht».

Den Fehlercode, den das Bedienteil der Heizung anzeigt (13 für «Startet nicht», 15 für «Unterspannung» und so weiter), liest Pekaway bei der 2D nicht aus. Die Brücke kennt die Codes aus dem Reparaturhandbuch und zeigt sie in Worten, sobald Pekaway sie liefert.

::: warning Antwortet die Heizung gar nicht mehr, merkt das niemand
<!-- handbuch-macke #49: Eine Autoterm, die nicht mehr antwortet, meldet Pekaway mit ihren letzten Werten weiter -->
Ist etwa das Kabel zur Heizung ab, meldet Pekaway einfach ihre letzten Werte weiter. Die Brücke sieht keinen Unterschied, und dein Screen zeigt weiter den alten Zustand.
:::

### Verbrauch {#verbrauch}

Den verbrauchten Diesel zählt die Brücke selbst. Sie nimmt die Frequenz der Brennstoffpumpe, die Pekaway meldet, mal die Zeit, mal 4.4 ml pro 100 Pumpenhübe, wie bei der Pumpe TH11. Pekaway fragt die Heizung nur alle sechs Sekunden ab, der Wert ist also eine Schätzung. Für einen Tankstand reicht das, auf den Milliliter genau ist es nicht. Fehlen länger als 30 Sekunden Antworten, etwa weil Node-RED neu startet, zählt die Brücke diese Lücke nicht mit.

Mit `reset` an `schaltli/cmnd/heater/fuel` beginnt der Zähler bei null, und «seit» ist die aktuelle Zeit des Pi. Stand und Zeitpunkt liegen retained auf dem Broker. Nach einem Neustart von Node-RED liest die Brücke sie dort zurück und zählt weiter.

## Dachlüfter {#dachlufter}

Den MaxxFan kennt die Brücke in zwei Formen. Steuert Pekaway ihn, kommen seine Werte von Pekaway. Läuft im Van der BLE-Flow aus `vanpi-custom`, meldet der Lüfter selbst, wie er steht. Sobald die Brücke einmal vom BLE-Flow gehört hat, liest sie nur noch ihn, bis Node-RED neu startet, und `schaltli/state/maxxfan/source` steht auf `ble`. Befehle an `schaltli/cmnd/maxxfan/…` setzt dann der BLE-Flow um, nicht Pekaway. Das kann er ab dem Stand von `vanpi-custom` vom Oktober 2026; einen älteren Flow spielst du mit `merge_flow.py --update` neu ein, wie im README von `vanpi-custom` beschrieben.

Ohne BLE-Flow macht die Brücke aus jedem Befehl, was Pekaway versteht. Drehzahl und Temperatur gibt sie als Wert weiter, Pekaway stellt sie Stufe um Stufe ein. Betriebsart, Deckel und Luftrichtung kennt Pekaway nur als Umschalten. Die Brücke schaltet deshalb um, wo der gemeldete Stand vom gewünschten abweicht. Den Deckel bewegt Pekaway im Automatikbetrieb nicht.

Der Baustein «MaxxFan» bringt alles mit. Oben stehen die Knöpfe «Aus», «Hand» und «Auto», darunter der Deckel. Dann kommt, was nur bei laufendem Lüfter zählt: im Automatikbetrieb die Zieltemperatur, von Hand die Drehzahl von 10 bis 100 in Zehnern, und in beiden Fällen die Luftrichtung. Ist der Lüfter aus, bleibt dieser Teil leer. Was dort steht, wählt ein Switcher im Baustein, siehe [Teile je nach Betrieb](/designer/bausteine#je-nach-betrieb).

::: warning Ohne BLE-Flow zeigt der Screen, was Pekaway glaubt
<!-- handbuch-macke #47: MaxxFan ohne BLE-Flow meldet keinen echten Zustand -->
Pekaway schickt dem Lüfter seine Befehle und hört nichts zurück. Bedienst du den Lüfter mit seiner eigenen Fernbedienung, wissen Pekaway und deine Screens davon nichts. Ein Befehl zum Umschalten kann danach das Gegenteil bewirken. Schalte den Lüfter dann einmal über einen Screen in den Stand, den er wirklich hat.
:::

## Was sie ankündigt {#ankuendigung}

Damit der Designer die Werte als [Bausteine](/designer/bausteine) anbietet, kündigt die Brücke sie im Discovery-Format von Home Assistant an: für jedes Ding eine Beschreibung unter `homeassistant/…/config`, retained, alle unter dem Gerät «VanPi».

Den Dachlüfter, die Heizung und das Theme beschreibt sie zusätzlich als ganze Bausteine, unter `schaltli/blocks/maxxfan/config`, `schaltli/blocks/heater/config` und `schaltli/blocks/theme/config`. Im Block-Menü stehen dann «MaxxFan», die Heizung und «Theme» als je ein Baustein. Beim Theme tragen die Knöpfe «Hell» mit einer Sonne und «Dunkel» mit einem Mond. Die einzelnen Einträge, die sie ersetzen, fallen weg: beim Lüfter das Klimagerät, der Deckel und die Luftrichtung, bei der Heizung das Klimagerät und die beiden Stufen, beim Theme der Schalter. Der Timer der Heizung bleibt ein eigener Eintrag.

| Baustein | Teile |
|---|---|
| «MaxxFan» | Betriebsart (Aus, Hand, Auto); Deckel (Offen, Zu); im Automatikbetrieb die Zieltemperatur 0 bis 37 °C, von Hand die Drehzahl 10 bis 100, in beiden die Luftrichtung (Rein, Raus) |
| die Heizung | Betriebsart (Aus, Heizen); beim Heizen die Solltemperatur 12 bis 35 °C; die Raumtemperatur |
| die Heizung, eine Autoterm | klein zuoberst der Zustand, bei einer Störung die Störung; die Betriebsart (Aus, Temperatur, Leistung, Lüften) über die ganze Breite. Darunter [nebeneinander](/designer/bausteine#zwei-spalten) links je nach Betriebsart die Solltemperatur 12 bis 30 °C, gefüllt bis zur Raumtemperatur, die Leistungs- oder die Lüftungsstufe 1 bis 10, rechts der Timer (An, Aus) und, solange er an ist, die Laufzeit 0 bis 600 Minuten, gefüllt mit dem Rest. Zuunterst der Verbrauch mit «Nullen» daneben |

Welcher Regler der Heizung gerade gilt, steht in `schaltli/state/heater/view`. Bei einer Autoterm kannst du im Dialog die Abschnitte «Laufzeit» und «Verbrauch» abwählen, siehe [Abschnitte](/designer/bausteine#abschnitte). Zustand und Betriebsart kommen immer. Raumtemperatur, Spannung und Diagnose stehen nicht im Baustein, ihre Werte liegen aber unter `schaltli/state/…`, und du bindest sie bei Bedarf von Hand. Home Assistant sieht von diesen Bausteinen nichts, er bekommt weiter die einzelnen Dinge.

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
