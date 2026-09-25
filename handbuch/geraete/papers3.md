# M5Stack PaperS3

Ein E-Paper-Display mit 960 × 540 Pixeln in 16 Graustufen und Touch. E-Paper ist auch in praller Sonne gut lesbar und sieht aus wie bedrucktes Papier. Dafür ist es langsamer als ein LCD: Ein Screen baut sich sichtbar auf, und Bewegungen folgen dem Finger nicht.

<Screenshot narrow name="geraet-m5stack-papers3" alt="Tankanzeige und Lichtschalter auf dem PaperS3 in Graustufen" caption="Der Screen im Designer, im Rahmen des PaperS3." />

## Auf einen Blick

| | |
|---|---|
| Display | E-Paper, 960 × 540 Pixel, 16 Graustufen, nur quer |
| Bedienung | Touch |
| Strom | USB-C |
| Im Designer | «M5Stack PaperS3» |
| Einrichtungs-WLAN | `m5stack-papers3-setup`, Passwort `schaltli12345` |

## Farben werden Grau

Gestaltest du für den PaperS3, rechnet der Designer jede Farbe eines [Themes](/designer/themes) in eine der 16 Graustufen um, nach ihrer Helligkeit. Was im Designer zu sehen ist, entspricht dem, was das Display zeigt. Zwei Farben, die gleich hell sind, sehen auf dem PaperS3 gleich aus, auch wenn sie sich im Farbton unterscheiden, und so können auch zwei Themes gleich aussehen. Eine dunkle Variante gibt es auf dem PaperS3 nicht.

## Bedienung

Ein Tippen wirkt nach etwa einer Drittelsekunde. Wischgesten und Slider wirken erst beim Loslassen: Der Screen wechselt, wenn der Finger das Display verlässt, und ein Slider springt dorthin, wo du loslässt. Ein Slider schickt dabei genau einen Wert.

Jede Änderung zeichnet das Display nur an der Stelle neu, die sich geändert hat. Das geht schnell, hinterlässt mit der Zeit aber leichte Schatten. Nach zehn solchen Teiländerungen zeichnet der PaperS3 den ganzen Screen einmal sauber neu, sobald zehn Sekunden lang niemand das Display berührt hat. Beim Wechsel auf einen anderen Screen zeichnet er immer alles neu.

## Zurück in die Einrichtung

Halte einen Finger zehn Sekunden still auf das obere linke Viertel des Displays. Nach drei Sekunden erscheint ein Kasten mit <span class="ui fw">Setup in</span> und einem Countdown. Lässt du vorher los, passiert nichts, auch das Tippen darunter wird nicht ausgelöst.

Die Geste ist länger als bei den anderen Boards und auf eine Ecke beschränkt, damit sie beim normalen Bedienen nicht versehentlich passiert.

## Was es anzeigt

Ohne Projekt zeigt der PaperS3 <span class="ui fw">kein Projekt installiert</span>. Findet er sein WLAN nicht, zeigt er <span class="ui fw">WLAN nicht erreichbar</span> und den Namen des Netzes.
