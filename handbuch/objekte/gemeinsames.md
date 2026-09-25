# Gemeinsames

Was für mehrere Objekttypen gleich gilt.

## Noch kein Wert {#kein-wert}

Jedes Topic ist am Anfang leer, auf dem Gerät und in der Live-Vorschau. Ein Objekt, das ein Topic liest, zeigt dann nichts Erfundenes: Live Text bleibt leer, ein Bar zeigt nur den leeren Balken, ein Schalter eine leere Spur mit «?». Sobald die Anlage einen Wert meldet, erscheint er.

Nur der Editor und die Simulation zeigen stattdessen die Beispielwerte der Topics, damit du beim Gestalten etwas siehst.

## Bedingungen {#bedingungen}

Live Icon, Live Line und Switcher entscheiden mit Bedingungen, was sie zeigen. Eine Bedingung vergleicht den Wert des Topics mit einem Wert, den du eingibst:

| Vergleich | Bedeutung |
|---|---|
| `==` | gleich |
| `!=` | ungleich |
| `>` `>=` `<` `<=` | grösser, grösser oder gleich, kleiner, kleiner oder gleich |

`==` und `!=` vergleichen Text, ohne Leerzeichen am Anfang und Ende. So passt `== on` genau auf «on». Die anderen vier vergleichen Zahlen. Ein Wert, der keine Zahl ist, zählt dabei als 0.

Listen von Bedingungen werden von oben gelesen, die erste passende gilt.

## Kalibrierung {#kalibrierung}

Bar, Gauge, Slider und Dial rechnen einen Wert in einen Füllstand um. Die Punkte unter <span class="ui">Calibration</span> sagen, wie: Jeder ordnet einem <span class="ui">Value</span> einen Füllstand in Prozent zu (<span class="ui">Fill</span>). Dazwischen rechnet der Designer gerade Linien.

Ohne eigene Punkte gilt: 0 ist leer, 100 ist voll. Weitere Punkte brauchst du, wenn ein Tank nicht gleichmässig geformt ist oder ein Sensor keine Prozent liefert. Beispiel für einen Sensor, der 120 bei leerem und 880 bei vollem Tank meldet: die Punkte 120 → 0 % und 880 → 100 %.

Bei Slider und Dial bestimmen der kleinste und der grösste Punkt auch, welche Werte der Finger einstellen kann. Steigt und fällt die Kalibrierung, warnt der Designer: Dann stünde eine Stelle auf dem Balken für mehrere Werte, und der Finger wüsste nicht, welchen er meint.

## Farben {#farben}

Unter <span class="ui">Colour</span> wählst du keine Farbe, sondern eine Rolle im Theme des Screens: <span class="ui">Text</span>, <span class="ui">Accent</span>, <span class="ui">Panel</span> und so weiter. Welche Farbe daraus wird, bestimmt das Theme. Was die acht Rollen bedeuten, steht unter [Themes und Farben](/designer/themes#rollen). <span class="ui">Transparent</span> gibt es, wo ein Hintergrund durchsichtig sein darf.

Schalter und Buttons haben nur eine Farbe. Spur, Knopf, Tönung, gedrückter Zustand und ob die Schrift weiss oder schwarz wird, leitet der Designer daraus ab. Neue Schalter und Buttons bekommen die Rolle <span class="ui">Accent</span>.

Auch der leere Teil von Bar und Gauge ist keine eigene Einstellung: Er liegt zwischen der Füllfarbe und dem Hintergrund.

## Icon-Farbe {#icon-farbe}

Objekte mit Icon haben unter <span class="ui">Colour</span> eine Zeile für das Icon. Ohne Wahl behält es seine eigene Farbe. Hat ein Icon mehrere Farben, erscheint ein Hinweis mit <span class="ui">Flatten to one color</span>, das es einfarbig macht.

## Topics wählen {#topics}

Die Topic-Auswahl zeigt die Topics des Projekts als Baum. Bei einem JSON-Topic wählst du daneben ein Feld. Alles dazu unter [MQTT-Topics](/designer/topics#ein-topic-an-ein-objekt-binden).
