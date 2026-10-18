# Waveshare Knob-Touch LCD 1.8

Ein rundes Farbdisplay mit 360 × 360 Pixeln in einem Drehring. Der Ring ist ein sehr hochwertiger Drehencoder, das Display ein Touchscreen. Damit ist der Knob das Bedienteil für alles, was man dreht: Dimmer, Heizung, Lüfter.

<Screenshot narrow name="geraet-waveshare-knob-1v8.webp" alt="Tankanzeige und Lichtschalter auf dem runden Knob" caption="Der Screen im Designer, im Rahmen des Knob." />

## Auf einen Blick

| | |
|---|---|
| Display | rund, 360 × 360 Pixel, Farbe |
| Bedienung | Touch und Drehring |
| Strom | USB-C |
| Im Designer | «Waveshare Knob-Touch LCD 1.8» |
| Einrichtungs-WLAN | `waveshare-knob-1v8-setup`, Passwort `schaltli12345` |

## Der Drehring

Jede Raste des Rings löst eine Aktion aus, und welche, legst du im Designer fest, für jeden Screen einzeln. Der Designer führt den Ring als zwei Tasten, <span class="ui fw">Rotate Left</span> und <span class="ui fw">Rotate Right</span>. In den Eigenschaften des Screens wählst du unter <span class="ui">Hardware buttons</span> für jede, was passieren soll:

- <span class="ui">Adjust a slider or dial</span>: Der Ring stellt einen Slider oder Dial auf dem Screen, eine Stufe pro Raste, und schickt den neuen Wert. Mehr dazu unter [Einen Regler stellen](/designer/tasten#regler).
- <span class="ui">Send an MQTT message</span>: eine feste Nachricht, zum Beispiel einen Befehl, den die Anlage selbst als «eine Stufe heller» versteht.
- <span class="ui">Next screen</span> oder <span class="ui">Previous screen</span>: Mit dem Ring blätterst du dann durch die Screens.
- <span class="ui">Go to a screen</span>, <span class="ui">Go to the screen beside</span> und <span class="ui">Enter setup mode</span>.

Auf einem Master-Screen belegt, gilt die Aktion für alle Screens, die diesen Master verwenden.

## Screens wechseln

Du wischst zu den Nachbarn eines Screens: nach links und rechts durch die Hauptreihe, nach oben und unten zu einem Screen, der darunter oder darüber liegt, siehe [Screens über- und untereinander](/designer/screens#position). Der Screen folgt dabei dem Finger. Eine kurze Lasche am Rand zeigt, wohin eine Wischgeste führt. Eine andere Belegung wählst du im Designer wie beim Ring, in den Eigenschaften des Screens unter <span class="ui">Swipe navigation</span>.

Sobald sich der Finger ein Stück bewegt, zeigt der Knob am Rand, wohin eine Wischgeste führt: Icon und Name des Nachbarn, oben, unten, links oder rechts. Die Hinweise verblassen, während der Screen dem Finger folgt, und verschwinden beim Loslassen. Ein Tipp zeigt keine.

**Die Karte:** Wischst du und hältst den Finger am Ende kurz still, öffnet sich eine Karte aller Screens, angeordnet wie in <span class="ui">Manage Screens</span>. Die Hauptreihe liegt quer, ein Verlauf darunter, dein Screen ist in der Mitte umrandet. Der Finger bleibt auf dem Glas und dient als Zeiger. Die Kachel darunter leuchtet, und lässt du dort los, springt der Knob zu diesem Screen. Lässt du über deinem Screen oder neben allen Kacheln los, bleibt alles, wie es war. Am runden Rand verschiebt sich die Karte, so erreichst du auch Screens weiter weg. Versteckte Screens, Popups und Master stehen nicht darauf. Während die Karte offen ist, zählt das Halten für die Einrichtung nicht.

Die Icons wählst du im Designer in den Eigenschaften jedes Screens. Ein eigenes Screen-Menü hat der Knob nicht mehr, siehe [Das Screen-Menü gibt es nicht mehr](/designer/tasten#screen-menue).

## Display und Energie

Nach 15 Sekunden ohne Berührung und ohne Drehen geht das Display aus. Die erste Berührung weckt es nur, sie schaltet nichts. Wie lange es an bleibt und welcher Screen danach kommt, stellst du in der [Einrichtung](/geraete/einrichten#geraet) ein. Werte, die über MQTT ankommen, halten das Display nicht wach.

## Zurück in die Einrichtung

Halte einen Finger fünf Sekunden still irgendwo auf den Bildschirm. Nach drei Sekunden erscheint ein Countdown. Bewegt sich der Finger, beginnt die Zeit von vorn, und lässt du vorher los, passiert nichts. Danach zeigt der Knob wieder den QR-Code und öffnet sein Einrichtungs-WLAN.

## Beim Flashen

Der Knob meldet sich am Computer als zwei serielle Anschlüsse, je nachdem, wie herum das USB-C-Kabel steckt. Findet der [Flasher](/geraete/flashen) den falschen Chip oder verbindet er sich nicht, dreh den Stecker um 180 Grad. Eine BOOT-Taste brauchst du beim Knob nicht.
