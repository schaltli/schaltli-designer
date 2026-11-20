# Waveshare ESP32-S3-Touch-LCD-7

Ein Farbdisplay mit 800 × 480 Pixeln und Touch: so viele Pixel wie der [4.3B](/geraete/waveshare-4-3b), aber auf gut sieben Zoll, also erscheint alles grösser. Innen ist es fast dasselbe Board wie der 4.3B, und es läuft mit derselben Firmware.

<Screenshot narrow name="geraet-waveshare-touch-lcd-7.webp" alt="Tankanzeige und Lichtschalter auf dem 7-Zoll-Display" caption="Der Screen im Designer, im Rahmen des 7-Zoll-Displays." />

::: info Von Nutzern getestet
Ein 7" steht nicht auf dem Testtisch. Zwei Leser aus dem Pekaway-Forum haben Schaltli auf ihrem Board ausprobiert, beide mit Rev 1.2. Stimmt bei dir etwas nicht, schreib es ins Forum.
:::

## Auf einen Blick

| | |
|---|---|
| Display | 800 × 480 Pixel, Farbe, rund 154 × 86 mm |
| Bedienung | Touch |
| Strom | 5 V über USB-C |
| Schriften | Roboto, Inter und Roboto Condensed, mit 16 Graustufen, siehe [Schriftgrössen und Typografie](/objekte/anzeigen#stile) |
| Im Designer | «Waveshare ESP32-S3-Touch-LCD-7» |
| Einrichtungs-WLAN | `waveshare-touch-lcd-7-setup`, Passwort `schaltli12345` |

## Welches Board

Schaltli läuft auf dem «ESP32-S3-Touch-LCD-7» mit 800 × 480 Pixeln. Das 7B sieht ähnlich aus, hat aber einen anderen Bildschirm mit 1024 × 600 Pixeln und bleibt mit dieser Firmware dunkel. Die Revision steht auf der Rückseite. Getestet ist Rev 1.2.

## Flashen

Das Board hat zwei USB-C-Buchsen. Zum [Flashen](/geraete/flashen) steckst du das Kabel in die mit «UART» beschriftete. Im Flasher wählst du «Waveshare ESP32-S3 Touch LCD 7"».

Läuft auf deinem Board noch das Image des 4.3B, wie es im Forum zuerst ausprobiert wurde, flash es einmal neu. Das Image des 4.3B schaltet auf dem 7" die zweite Buchse ab, und erst mit dem eigenen Image kennt der Designer das Board als 7".

## Strom

Das 7" hat keine Klemmen fürs Bordnetz wie der 4.3B. Es braucht 5 V über USB-C, im Van also einen USB-Adapter am 12-V-Netz. Auf der Rückseite gibt es einen Anschluss für einen einzelnen Lithium-Akku (3,7 V), den das Board auch lädt.

## Bedienung

Bedient wird es wie der 4.3B. Wischgesten belegst du im Designer in den Eigenschaften des Screens unter <span class="ui">Swipe navigation</span>, und die Seite folgt beim Wischen dem Finger. Das Display erkennt zwei Finger, du kannst also auch <span class="ui">Pinch in</span> und <span class="ui">Pinch out</span> belegen. Ein [Diagramm](/objekte/anzeigen#chart) mit <span class="ui">Scrolling</span> ziehst du seitwärts durch die Zeit.

Nach einer Weile ohne Berührung geht das Display aus. Die erste Berührung weckt es nur, sie schaltet nichts. Wie lange es an bleibt, stellst du in der [Einrichtung](/geraete/einrichten#geraet) ein.

## Ein Projekt vom 4.3B

Ein Projekt, das du für den 4.3B gemacht hast, stellst du unter <span class="ui">Settings</span> › <span class="ui">Device</span> auf das 7" um, siehe [Ein anderes Gerät](/designer/deploy#ein-anderes-gerat). Beide haben 800 × 480 Pixel, deine Objekte bleiben also, wo sie sind. Die Schriften kommen danach vom 7" und sind auf sein grösseres Glas abgestimmt.

## Zurück in die Einrichtung

Halte einen Finger fünf Sekunden still irgendwo auf den Bildschirm. Nach drei Sekunden erscheint <span class="ui fw">Setup in</span> mit einem Countdown. Bewegt sich der Finger, beginnt die Zeit von vorn, und lässt du vorher los, passiert nichts.

Hat es noch kein Projekt, zeigt es einen eingebauten Test-Screen.
