# Waveshare Knob-Touch LCD 1.8

Ein rundes Farbdisplay mit 360 × 360 Pixeln in einem Drehring. Der Ring ist ein sehr hochwertiger Drehencoder, das Display ein Touchscreen. Damit ist der Knob das Bedienteil für alles, was man dreht: Dimmer, Heizung, Lüfter.

<Screenshot narrow name="geraet-waveshare-knob-1v8" alt="Tankanzeige und Lichtschalter auf dem runden Knob" caption="Der Screen im Designer, im Rahmen des Knob." />

## Auf einen Blick

| | |
|---|---|
| Display | rund, 360 × 360 Pixel, Farbe |
| Bedienung | Touch und Drehring |
| Strom | USB-C |
| Im Designer | «Waveshare Knob-Touch LCD 1.8» |
| Einrichtungs-WLAN | `waveshare-knob-1v8-setup`, Passwort `schaltli12345` |

## Der Drehring

Jede Raste des Rings löst eine Aktion aus, und welche, legst du im Designer fest, für jeden Screen einzeln. Der Designer zeigt den Ring als zwei Tasten am Rand des Geräts: <span class="ui fw">Rotate Left</span> und <span class="ui fw">Rotate Right</span>. Klick auf eine davon und wähle unter <span class="ui">Does</span>, was passieren soll:

- <span class="ui">Send an MQTT message</span>: zum Beispiel einen Befehl, der einen Dimmer eine Stufe heller oder dunkler stellt.
- <span class="ui">Next screen</span> oder <span class="ui">Previous screen</span>: Mit dem Ring blätterst du dann durch die Screens.
- <span class="ui">Go to a screen</span>, <span class="ui">Enter setup mode</span> und die Geräteaktion <span class="ui">Show Screen Menu</span>.

Auf einem Master-Screen belegt, gilt die Aktion für alle Screens, die diesen Master verwenden.

## Screens wechseln

Wischgesten belegst du im Designer wie den Ring, in den Eigenschaften des Screens unter <span class="ui">Swipe navigation</span>. Beim Wischen folgt die Seite dem Finger.

Der Knob hat zusätzlich ein eigenes Screen-Menü, die Geräteaktion <span class="ui">Show Screen Menu</span>, zum Beispiel auf «nach oben wischen» gelegt. Es zeigt alle Screens als Kacheln mit ihrem Screen-Icon. Die Icons wählst du im Designer in den Eigenschaften jedes Screens.

## Display und Energie

Nach 15 Sekunden ohne Berührung und ohne Drehen geht das Display aus. Die erste Berührung weckt es nur, sie schaltet nichts. Wie lange es an bleibt und welcher Screen danach kommt, stellst du in der [Einrichtung](/geraete/einrichten#geraet) ein. Werte, die über MQTT ankommen, halten das Display nicht wach.

## Zurück in die Einrichtung

Halte einen Finger fünf Sekunden irgendwo auf den Bildschirm. Nach einer Sekunde erscheint ein Countdown. Lässt du vorher los, passiert nichts. Danach zeigt der Knob wieder den QR-Code und öffnet sein Einrichtungs-WLAN.

<!-- handbuch-macke #8: Setup-Text nennt eine Push-Taste -->
Der Hinweis «Hold Push (3s) for AP», den der Knob in einer Situation anzeigt, stimmt nicht: Der Knob hat keine solche Taste. Es gilt die Geste mit dem Finger.

## Beim Flashen

Der Knob meldet sich am Computer als zwei serielle Anschlüsse, je nachdem, wie herum das USB-C-Kabel steckt. Findet der [Flasher](/geraete/flashen) den falschen Chip oder verbindet er sich nicht, dreh den Stecker um 180 Grad. Eine BOOT-Taste brauchst du beim Knob nicht.
