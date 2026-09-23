# WLAN und MQTT einrichten

Ein frisch geflashtes Board kennt weder dein WLAN noch deinen Broker. Beides trägst du einmal ein, über ein kleines WLAN, das das Board selbst aufmacht. Für die [Android-App](/geraete/android#mit-dem-broker-verbinden) geht es anders, direkt in der App.

## Das Einrichtungs-WLAN

Im Einrichtungsmodus zeigt das Board einen QR-Code und öffnet ein eigenes WLAN:

| Board | WLAN | Passwort |
|---|---|---|
| Knob | `waveshare-knob-1v8-setup` | `schaltli12345` |
| 4.3B | `waveshare-touch-lcd-4v3b-setup` | `schaltli12345` |
| PaperS3 | `m5stack-papers3-setup` | `schaltli12345` |

Scanne den QR-Code mit der Kamera deines Handys. Das Handy bietet dann an, sich mit dem WLAN zu verbinden, und öffnet danach die Einrichtungsseite von selbst. Tut es das nicht, öffne im Browser `http://192.168.4.1`.

Verbindet sich zwei Minuten lang niemand, startet das Board neu. Solange ein Handy verbunden ist, wartet es.

## Die Einrichtungsseite

Die Seite hat drei Tabs.

### WiFi Setup

Unter <span class="ui fw">Available Networks</span> listet das Board die WLANs, die es sieht. Tippe auf deines, gib unter <span class="ui fw">Password</span> das Passwort ein und tippe auf <span class="ui fw">Save WiFi Settings</span>.

### MQTT Connection

Trag unter <span class="ui fw">Host</span> die IP-Adresse deines Pekaway-Systems ein. <span class="ui fw">Port</span> bleibt bei 1883, Benutzername und Passwort bleiben leer, wenn dein Broker keine verlangt. Ein Pekaway-System verlangt keine. Tippe auf <span class="ui fw">Save MQTT Settings</span>.

<span class="ui fw">Test MQTT Connection</span> funktioniert hier noch nicht. Der Test braucht dein WLAN, und das Board hängt gerade im eigenen. Er meldet dann nur, dass keine WLAN-Verbindung besteht.

### Device {#geraet}

Hier stellst du ein, wie sich das Display verhält. Die Einstellungen gehören zum Gerät, nicht zum Projekt, und bleiben bei jedem neuen Projekt erhalten.

- <span class="ui fw">Turn the display off after</span>: Sekunden ohne Berührung, bis das Display ausgeht. Voreingestellt sind 15, 0 lässt es immer an. Werte, die über MQTT ankommen, zählen nicht als Aktivität.
- <span class="ui fw">When it goes dark, return to</span>: der Screen, den das Board beim Ausgehen und nach jedem Start zeigt. Nimm dafür etwas Harmloses, zum Beispiel die Übersicht, damit ein versehentlicher Griff ans Display nichts Wichtiges auslöst.

Tippe auf <span class="ui fw">Save Device Settings</span>.

## Einrichtung beenden

Tippe unten auf <span class="ui fw">Cancel and restart</span>. Trotz des Namens bleibt alles erhalten, was du gespeichert hast. Das Board verlässt nur den Einrichtungsmodus, startet neu und verbindet sich mit deinem WLAN und dem Broker.

<!-- handbuch-macke (Issue folgt): Cancel and restart klingt nach Verwerfen -->

Danach erscheint das Board im Designer, auf der Startseite unter <span class="ui">Announced Devices</span> und im Dialog <span class="ui">Deploy to Device</span>.

## Später wieder in die Einrichtung {#spaeter-wieder-in-die-einrichtung}

Jedes Board kommt mit einer Geste zurück in den Einrichtungsmodus, etwa wenn sich das WLAN geändert hat:

- **Knob und 4.3B:** einen Finger fünf Sekunden irgendwo auf das Display halten.
- **PaperS3:** einen Finger zehn Sekunden still auf das obere linke Viertel halten.

Ein Countdown zeigt, dass die Geste läuft. Lässt du vorher los, passiert nichts.

Du kannst auch einen Button oder eine Taste im Designer mit <span class="ui">Enter setup mode</span> belegen.
