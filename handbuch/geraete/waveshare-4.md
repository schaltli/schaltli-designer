# Waveshare ESP32-S3-Touch-LCD-4

Ein quadratisches Farbdisplay mit 480 × 480 Pixeln und Touch. Es ist kleiner als der [4.3B](/geraete/waveshare-4-3b) und passt auch dorthin, wo für ein breites Display der Platz fehlt. Wie der 4.3B hängt es direkt am 12-V-Bordnetz.

<Screenshot narrow name="geraet-waveshare-touch-lcd-4.webp" alt="Tankanzeige und Lichtschalter auf dem quadratischen 4-Zoll-Display" caption="Der Screen im Designer, im Rahmen des 4-Zoll-Displays." />

## Auf einen Blick

| | |
|---|---|
| Display | 480 × 480 Pixel, Farbe |
| Bedienung | Touch |
| Strom | 7–36 V an den Schraubklemmen auf der Rückseite, oder USB-C |
| Im Designer | «Waveshare ESP32-S3-Touch-LCD-4» |
| Einrichtungs-WLAN | `waveshare-touch-lcd-4-setup`, Passwort `schaltli12345` |

## Welches Board

Schaltli läuft auf der Ausführung, auf deren Rückseite «Rev 4.0» steht. Eine ältere V3 sieht von vorn gleich aus, bleibt mit der Schaltli-Firmware aber dunkel. Schau vor dem Kauf auf das Produktfoto der Rückseite oder frag beim Händler nach.

## Strom aus dem Bordnetz

Der grüne Klemmenblock auf der Rückseite nimmt 7 bis 36 Volt. Das 12-V-Netz des Vans kannst du direkt anschliessen, ein 24-V-Netz ebenso. Achte auf die Polung und sichere die Leitung ab wie bei jedem anderen Verbraucher. Zum Flashen und Ausprobieren am Schreibtisch reicht USB-C.

## Bedienung

Bedient wird es wie der 4.3B. Wischgesten belegst du im Designer in den Eigenschaften des Screens unter <span class="ui">Swipe navigation</span>, und die Seite folgt beim Wischen dem Finger. Das Display erkennt zwei Finger, du kannst also auch <span class="ui">Pinch in</span> und <span class="ui">Pinch out</span> belegen. Ein [Diagramm](/objekte/anzeigen#chart) mit <span class="ui">Scrolling</span> ziehst du seitwärts durch die Zeit.

Nach einer Weile ohne Berührung geht das Display aus. Die erste Berührung weckt es nur, sie schaltet nichts. Wie lange es an bleibt, stellst du in der [Einrichtung](/geraete/einrichten#geraet) ein.

## Zurück in die Einrichtung

Halte einen Finger fünf Sekunden still irgendwo auf den Bildschirm. Nach drei Sekunden erscheint <span class="ui fw">Setup in</span> mit einem Countdown. Bewegt sich der Finger, beginnt die Zeit von vorn, und lässt du vorher los, passiert nichts.

## WLAN

Das WLAN dieses Boards ist schwächer als das des 4.3B und hängt davon ab, wie das Board liegt. Am Schreibtisch kamen die Daten fast neunmal schneller an, nachdem es nur umgedreht worden war. Für Werte und Schalter reicht der Empfang, ein Projekt hochzuladen dauert aber länger. Bau es nicht hinter Metall ein, und probier bei schwachem Empfang zuerst eine andere Lage aus, bevor du es festschraubst.

Findet das Board sein WLAN nicht, zeigt es <span class="ui fw">WLAN nicht erreichbar</span> mit dem Namen des Netzes und versucht es weiter. In die Einrichtung wechselt es dabei nicht von selbst. Hat sich das WLAN geändert, nimm die Geste oben.

Hat es noch kein Projekt, zeigt es einen eingebauten Test-Screen.
