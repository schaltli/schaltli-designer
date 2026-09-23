# Waveshare ESP32-S3-Touch-LCD-4.3B

Ein Farbdisplay mit 800 × 480 Pixeln und Touch, gross genug für eine ganze Übersicht: Tanks, Batterie, Licht und Dimmer auf einem Screen. Der 4.3B lässt sich direkt an das 12-V-Bordnetz des Vans anschliessen, ohne Netzteil und ohne USB-Adapter.

<Screenshot narrow name="geraet-waveshare-touch-lcd-4v3b" alt="Tankanzeige und Lichtschalter auf dem 4.3B" caption="Der Screen im Designer, im Rahmen des 4.3B." />

## Auf einen Blick

| | |
|---|---|
| Display | 800 × 480 Pixel, Farbe |
| Bedienung | Touch |
| Strom | 7–36 V an den Schraubklemmen auf der Rückseite, oder USB-C |
| Im Designer | «Waveshare ESP32-S3-Touch-LCD-4.3B» |
| Einrichtungs-WLAN | `waveshare-touch-lcd-4v3b-setup`, Passwort `schaltli12345` |

## Strom aus dem Bordnetz

Die Schraubklemmen auf der Rückseite nehmen 7 bis 36 Volt. Das 12-V-Netz des Vans kannst du also direkt anschliessen, ein 24-V-Netz ebenso. Achte auf die richtige Polung und sichere die Leitung ab, wie jeden anderen Verbraucher im Bordnetz. Zum Flashen und Ausprobieren am Schreibtisch reicht USB-C.

## Bedienung

Wischgesten belegst du im Designer in den Eigenschaften des Screens unter <span class="ui">Swipe navigation</span>. Beim Wischen folgt die Seite dem Finger. Buttons zeigen beim Antippen ihren gedrückten Zustand.

Nach einer Weile ohne Berührung geht das Display aus. Die erste Berührung weckt es nur, sie schaltet nichts. Wer nachts nach dem dunklen Display greift, löst also nicht versehentlich etwas aus. Wie lange das Display an bleibt und welcher Screen danach kommt, stellst du in der [Einrichtung](/geraete/einrichten#geraet) ein.

## Zurück in die Einrichtung

Halte einen Finger fünf Sekunden irgendwo auf den Bildschirm. Nach einer Sekunde erscheint <span class="ui fw">Setup in</span> mit einem Countdown. Lässt du vorher los, passiert nichts.

## Wenn das WLAN fehlt

Findet der 4.3B sein WLAN nicht, zeigt er <span class="ui fw">WLAN nicht erreichbar</span> und den Namen des Netzes, und er versucht es weiter. In die Einrichtung wechselt er dabei nicht von selbst. Hat sich das WLAN geändert, nimm die Geste oben.

Hat er noch kein Projekt, zeigt er einen eingebauten Test-Screen.
