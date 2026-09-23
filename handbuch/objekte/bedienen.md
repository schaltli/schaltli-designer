# Bedienen

Objekte, die etwas schalten oder einstellen. Sie brauchen ein Gerät mit Touch.

Allen gemeinsam ist: Was du antippst, geht als Befehl an ein Topic, und angezeigt wird, was die Anlage zurückmeldet. Ein Schalter springt also erst ganz auf «an», wenn das Licht wirklich an ist. So stimmt die Anzeige immer mit dem Van überein, auch wenn jemand am anderen Ende des Vans schaltet. Mehr dazu unter [MQTT-Topics](/designer/topics#lesen-und-schalten).

## Slider {#slider}

Ein Balken, den der Finger einstellt: Dimmer, Lüfter, Solltemperatur. Der Baustein <span class="ui">Dimmer</span> setzt einen Slider. Er hat dieselben Eigenschaften wie der [Bar](/objekte/anzeigen#bar), dazu unter <span class="ui">Data</span>:

- <span class="ui">Write topic</span>: wohin der eingestellte Wert geht. Immer das ganze Topic, nie ein JSON-Feld.
- <span class="ui">Step</span>: in welchen Schritten der Wert springt, etwa 5 für einen Dimmer oder 0.5 für eine Temperatur. Der Designer zeigt darunter, wie viele Stufen das ergibt und ob der Schritt zum Bereich passt.

Der einstellbare Bereich reicht vom kleinsten bis zum grössten [Kalibrierpunkt](/objekte/gemeinsames#kalibrierung).

**Am Gerät:** Der Finger setzt den Wert dort, wo er den Balken berührt, und zieht ihn mit. Während des Ziehens schickt der Slider höchstens alle 250 Millisekunden einen Wert, beim Loslassen immer den letzten. Der Finger bewegt dabei die Markierung, nicht die Füllung: Die Füllung zeigt weiter den gemessenen Wert, bis die Anlage den neuen meldet. Die grosse Zahl zeigt den gewünschten Wert, den gemessenen klein in Klammern daneben, solange sie sich unterscheiden.

Meldet die Anlage einen neuen Wert, gilt dieser, auch wenn er vom gewünschten abweicht. Geht ein Befehl verloren, stimmt die Anzeige spätestens nach der nächsten Meldung der Anlage wieder.

Ein Wischen, das auf einem Slider beginnt, gehört dem Slider und blättert nicht den Screen um. Auf dem [PaperS3](/geraete/papers3) wirkt ein Slider erst beim Loslassen und schickt genau einen Wert.

## Dial {#dial}

Wie Slider, aber als Ring, etwa für eine Heizung. Er hat dieselben Eigenschaften wie der [Gauge](/objekte/anzeigen#gauge), dazu <span class="ui">Write topic</span> und <span class="ui">Step</span>. Am Gerät verhält er sich wie ein Slider auf einem Kreisbogen.

## Switch {#switch}

Ein Schalter mit Knopf in einer Spur, wie man ihn von Handys kennt. Der Baustein <span class="ui">Switch</span> setzt einen.

- <span class="ui">Read topic</span>: der gemeldete Zustand.
- <span class="ui">Write topic</span>: wohin der Befehl geht.
- <span class="ui">Style</span>: <span class="ui">Full colour</span> für eine kräftige Spur oder <span class="ui">Tint</span> für eine zurückhaltende.
- <span class="ui">States</span>: die Zustände, meist zwei, «Aus» und «An». Jeder hat:
  - <span class="ui">Label</span>: den Text neben dem Schalter.
  - <span class="ui">Read / write</span>: den Wert, der für diesen Zustand auf dem Lese-Topic ankommt, und den, der beim Wählen geschickt wird. Oft dasselbe Wort, etwa `on`.
  - <span class="ui">Icon</span>: ein Icon auf dem Knopf.
  - <span class="ui">Shows as on</span>: ob dieser Zustand als «an» gilt. Dann hat die Spur volle Farbe.
- <span class="ui">Colour</span>: die eine Farbe des Schalters. Alles andere leitet der Designer daraus ab.

**Am Gerät:** Bei zwei Zuständen schaltet ein Tippen irgendwo auf den Schalter um. Bei mehr Zuständen wählt ein Tippen auf die Spur die Stelle unter dem Finger, ein Tippen daneben den nächsten Zustand. Der Knopf springt sofort an die gewünschte Stelle; die Farbe folgt, wenn die Anlage den neuen Zustand meldet.

Ohne Wert zeigt der Schalter eine leere Spur ohne Knopf und ein «?».

## Button Group {#button-group}

Mehrere Schaltflächen nebeneinander, von denen immer eine gewählt ist, etwa Heizstufen «Aus», «Eco», «Komfort». Die Eigenschaften sind dieselben wie beim [Switch](#switch). Statt <span class="ui">Shows as on</span> hat jeder Zustand <span class="ui">Icon when active</span>: ein anderes Icon, solange er gewählt ist, etwa eine gefüllte statt einer leeren Lampe.

**Am Gerät:** Ein Tippen auf eine Schaltfläche schickt ihren Wert. Die gemeldete hat eine gefüllte Fläche, die gewünschte bekommt einen Ring, bis die Anlage antwortet. Ohne Wert ist keine Schaltfläche markiert.

## Button {#button}

Eine Schaltfläche, die beim Antippen etwas tut.

- <span class="ui">Text</span> und <span class="ui">Icon</span>: die Beschriftung.
- <span class="ui">Does</span>: die Aktion:
  - <span class="ui">Next screen</span>, <span class="ui">Previous screen</span> oder <span class="ui">Go to a screen</span>
  - <span class="ui">Send an MQTT message</span>, mit <span class="ui">Topic</span> und <span class="ui">Message</span>
  - <span class="ui">Enter setup mode</span>: in die [Einrichtung](/geraete/einrichten) des Geräts
  - <span class="ui">Device action</span>: etwas, das nur dieses Gerät kann
- <span class="ui">Style</span>: <span class="ui">Filled</span>, <span class="ui">Tonal</span> oder <span class="ui">Outlined</span>.
- <span class="ui">Colour</span>: die eine Farbe des Buttons. Ob die Schrift weiss oder schwarz wird, rechnet der Designer daraus aus.

Ein Button liest kein Topic und zeigt keinen Zustand. Für etwas, das an oder aus ist, nimm einen [Switch](#switch).

Den gedrückten Zustand zeigt derzeit nur der [4.3B](/geraete/waveshare-4-3b).
