# LilyGO T-Encoder Pro

Ein kleines rundes AMOLED-Display, 1.2 Zoll und 390 × 390 Pixel, in einem Ring, den du drehst und drückst. Er ist kleiner als der [Knob](/geraete/knob) und wird gleich bedient, mit einem Druck auf den Ring als dritter Taste. Damit passt er dorthin, wo ein einzelner Regler hingehört: Heizung, Lüfter, ein Dimmer.

<Screenshot narrow name="geraet-lilygo-t-encoder-pro.webp" alt="Tankanzeige und Lichtschalter auf dem runden T-Encoder Pro" caption="Der Screen im Designer, im Rahmen des T-Encoder Pro." />

## Auf einen Blick

| | |
|---|---|
| Display | rund, 390 × 390 Pixel, AMOLED, Farbe |
| Bedienung | Touch, Drehring, Ring drücken |
| Strom | USB-C |
| Schriften | Roboto, Inter und Roboto Condensed, mit 16 Graustufen, siehe [Schriftgrössen und Typografie](/objekte/anzeigen#stile) |
| Im Designer | «LilyGO T-Encoder Pro» |
| Einrichtungs-WLAN | `lilygo-t-encoder-pro-setup`, Passwort `schaltli12345` |

## Welche Ausführung

LilyGO verkauft den T-Encoder Pro in zwei Ausführungen, die von aussen gleich aussehen. Schaltli läuft auf der mit dem Display-Chip SH8601 und dem Touch-Chip CHSC5816. Die neuere mit CO5300 und CST816 wird noch nicht unterstützt. Bleibt das Display nach dem [Flashen](/geraete/flashen) schwarz, obwohl der Flasher fertig gemeldet hat, ist es wahrscheinlich diese.
<!-- handbuch-macke #84: die neuere Ausführung (CO5300, CST816) bleibt dunkel -->

## Drehen und drücken

Der Designer führt den Ring als drei Tasten: <span class="ui fw">Rotate Left</span>, <span class="ui fw">Rotate Right</span> und <span class="ui fw">Press</span>. Jede Raste löst <span class="ui fw">Rotate Left</span> oder <span class="ui fw">Rotate Right</span> einmal aus, ein Druck auf den Ring <span class="ui fw">Press</span>. Was dabei passiert, wählst du in den Eigenschaften des Screens unter <span class="ui">Hardware buttons</span>, für jeden Screen einzeln. Es gibt dieselben Aktionen wie beim [Drehring des Knob](/geraete/knob#der-drehring), zum Beispiel <span class="ui">Adjust a slider or dial</span> für die Drehrichtungen und <span class="ui">Send an MQTT message</span> für den Druck, der etwas ein- und ausschaltet.

## Wo oben ist

Ein rundes Display zeigt nicht, wo oben ist. Steht der Screen aufrecht und du schaust von vorne auf das Display, sitzt die USB-C-Buchse hinten bei 11 Uhr. Plane den Einbau danach, damit das Kabel dort Platz hat und die Screens gerade stehen.

## Screens wechseln

Wie beim Knob: Du wischst zu den Nachbarn eines Screens, nach links und rechts durch die Hauptreihe, nach oben und unten zu einem Screen darunter oder darüber. Wischst du und hältst den Finger am Ende kurz still, öffnet sich die Karte aller Screens. Beides beschreibt die [Seite des Knob](/geraete/knob#screens-wechseln).

## Display und Energie

Nach 15 Sekunden ohne Berührung, Drehen oder Drücken geht das Display aus. Die erste Raste oder der erste Druck weckt es nur, ausgelöst wird dabei nichts.

Ein AMOLED leuchtet Pixel für Pixel selbst, eine Hintergrundbeleuchtung hat es nicht. Ausgeschaltet ist es ganz schwarz. Steht derselbe Screen über Monate stundenlang an, können sich helle Flächen mit der Zeit einbrennen. Lass das Display deshalb ausgehen: Unter <span class="ui fw">Turn the display off after</span> in der [Einrichtung](/geraete/einrichten#geraet) ist 0, also immer an, beim T-Encoder Pro keine gute Wahl.

## Zurück in die Einrichtung

Halte einen Finger fünf Sekunden still irgendwo auf das Display. Nach drei Sekunden erscheint ein Countdown. Bewegt sich der Finger, beginnt die Zeit von vorn, und lässt du vorher los, passiert nichts. Danach zeigt der T-Encoder Pro wieder den QR-Code und öffnet sein Einrichtungs-WLAN.

## Beim Flashen

Der Druck auf den Ring ist zugleich die BOOT-Taste des Chips. Hältst du den Ring gedrückt, während du das USB-Kabel einsteckst, startet das Board nicht, sondern wartet auf einen Flasher. Das hilft, wenn der [Flasher](/geraete/flashen) keine Verbindung bekommt: Kabel raus, Ring drücken und halten, Kabel rein, loslassen, dann im Flasher neu verbinden. Sonst drückst du den Ring beim Einstecken nicht.
