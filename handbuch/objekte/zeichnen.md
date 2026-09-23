# Zeichnen

Linien und Flächen, um einen Screen zu gliedern, und eine Linie, die einen Energiefluss zeigt.

## Line {#line}

Eine Linie durch beliebig viele Punkte. Mit der Maus gezogen entsteht eine gerade Linie; mit Klicks setzt du Punkt für Punkt, siehe [Objekte platzieren](/designer/objekte#ein-objekt-setzen).

- <span class="ui">Stroke width</span>: die Strichstärke, 1 bis 10 Pixel.
- <span class="ui">Stroke style</span>: durchgezogen, gestrichelt oder gepunktet. Die Geräte zeichnen derzeit nur durchgezogene Linien.
- <span class="ui">Start cap</span> und <span class="ui">End cap</span>: ein Pfeil an Anfang oder Ende.
- <span class="ui">Corner radius</span>: abgerundete Ecken, ab drei Punkten.
- <span class="ui">Points</span>: die Punkte mit ihrer Position. <span class="ui">Add point</span> fügt einen hinzu.
- <span class="ui">Stroke</span>: die Farbe.

Verschoben wird eine Linie auf dem Screen oder über ihre Punkte, nicht über <span class="ui">Frame</span>.

## Live Line {#live-line}

Eine Linie, deren Stärke und Pfeile einem Wert folgen, zum Beispiel ein Energiefluss: dick bei viel Strom, der Pfeil zeigt die Richtung.

- <span class="ui">Topic</span>: der Wert, etwa eine Leistung in Watt.
- <span class="ui">Width by value</span>: welcher Wert welche Strichstärke ergibt. Dazwischen rechnet der Designer weich über. Der Betrag zählt, das Vorzeichen nicht.
- <span class="ui">Arrows</span>: wann ein Pfeil am Anfang (<span class="ui">Start when</span>) und wann am Ende (<span class="ui">End when</span>) erscheint. Voreingestellt ist: Pfeil am Anfang bei negativem Wert, am Ende bei positivem. So zeigt eine Linie zwischen Batterie und Verbraucher, ob geladen oder entladen wird.
- <span class="ui">Points</span>, <span class="ui">Corner radius</span> und <span class="ui">Stroke</span> wie bei Line.

Ohne Wert zeichnet Live Line nichts.

## Box {#box}

Ein Rechteck, als Fläche oder Rahmen.

- <span class="ui">Stroke width</span>: die Randstärke. 0 lässt den Rand weg.
- <span class="ui">Corner radius</span>: abgerundete Ecken.
- <span class="ui">Fill</span> und <span class="ui">Stroke</span>: Füllfarbe und Randfarbe.
