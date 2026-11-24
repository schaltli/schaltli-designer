# Instrumente

Ein [Gauge](/objekte/anzeigen#gauge) oder ein [Bar](/objekte/anzeigen#bar) kann wie ein echtes Messinstrument aussehen: ein Manometer aus Messing, eine Tankuhr aus dem Lastwagen, ein leuchtendes Kombiinstrument von heute. Das ist ein Stil, kein eigenes Objekt. Topic, Kalibrierung und Grösse bleiben, wie sie sind; der Stil zeichnet nur anders.

Stile gibt es nur für die Objekte zum Ablesen. Slider und Dial bleiben flach.

## Die elf Stile {#stile}

| <span class="ui">Style</span> | Vorbild | Nadel |
|---|---|---|
| <span class="ui">Pressure gauge</span> | Manometer, 1887: Messing, Nieten, vergilbtes Zifferblatt. Als Bar ein Wasserstandsglas | schwingt lange nach |
| <span class="ui">Art deco</span> | Thermometer, 1938: Gold, Elfenbein, blaue Nadel. Als Bar ein Stufenturm mit Band | schwingt leicht nach |
| <span class="ui">Moving coil</span> | Drehspul-Voltmeter, 1952: Bakelit, Spiegelskala, Drehpunkt unter dem Fenster. Als Bar ein Profilinstrument | schwingt kaum |
| <span class="ui">Roadster</span> | offener Sportwagen, 1962: Chromring, schwarzes Zifferblatt | schwingt leicht nach |
| <span class="ui">Cockpit</span> | Flugzeug, 1965: Flansch mit vier Schrauben, nachleuchtende Ziffern | schwingt leicht nach |
| <span class="ui">Rally</span> | Rallye, 1974: grosse weisse Ziffern, breite orange Nadel | schwingt deutlich nach |
| <span class="ui">VFD</span> | Digital-Cockpit, 1985: Leuchtsegmente, der Wert als Zahl | springt fast sofort |
| <span class="ui">Fuel gauge</span> | Tankuhr im Nutzfahrzeug, 1992: E, ½ und F | kriecht, ohne Überschwingen |
| <span class="ui">Blue and red</span> | Kompaktwagen, 1995: blaue Skala, rote Nadel | schwingt leicht nach |
| <span class="ui">Night drive</span> | Kombiinstrument, 2024: Leuchtring, der Wert als Zahl in der Mitte | ruhig, ohne Überschwingen |
| <span class="ui">Engraving</span> | Kupferstich: nur Schwarz auf Papier, schraffiert. Für E-Paper gemacht | schwingt kaum |

<span class="ui">Flat</span> ist der gewohnte Ring oder Balken ohne Stil.

## Einen Stil wählen {#waehlen}

Wähl den Gauge oder Bar aus und nimm unter <span class="ui">Style</span> einen Stil. Was der Stil festlegt, verschwindet aus den Eigenschaften: Farben, Dicke, Bogen und die Zahl neben dem Balken. Ein Drehspul-Instrument schwenkt nur 80 Grad, ein Cockpit-Instrument fast einen ganzen Kreis. Beim Bar bleibt <span class="ui">Direction</span>: Jeder Stil läuft in alle vier Richtungen.

Dafür kommen drei Abschnitte dazu.

### Face {#face}

- <span class="ui">Caption</span>: ein Wort auf dem Zifferblatt, etwa «Frischwasser» oder «Batterie». Ist es zu lang für den Platz zwischen den Zahlen der Skala, rückt der Designer die Buchstaben enger zusammen und schreibt es nötigenfalls kleiner. Ein kurzes Wort bleibt auf einem kleinen Instrument besser lesbar.
- <span class="ui">Unit</span>: die Einheit, etwa «bar», «V» oder «°C».
- <span class="ui">Readout</span>: der Wert zusätzlich als Zahl. Nur beim <span class="ui">VFD</span> und bei <span class="ui">Night drive</span>, und dort von Anfang an eingeschaltet. Die Zahl zeigt den Wert sofort, auch wenn die Nadel noch unterwegs ist. Sie steht in der Schrift des Stils, nicht in einer Schrift des Projekts.
- <span class="ui">Motion</span>: <span class="ui">As the style</span> lässt die Nadel nachschwingen, wie es zum Vorbild passt, siehe die Tabelle oben. <span class="ui">Direct</span> lässt sie ohne Bewegung auf den neuen Wert springen.

### Scale {#skala}

Die Skala rechnet der Designer aus dem Bereich der [Kalibrierung](/objekte/gemeinsames#kalibrierung) aus. Er nimmt runde Schritte (1, 2 oder 5 mal eine Zehnerpotenz) und lässt Striche und Zahlen weg, die sich auf einem kleinen Instrument drängen würden. Die Felder brauchst du nur, wenn du es anders willst; eine 0 heisst automatisch.

- <span class="ui">Major step</span>: der Abstand der grossen Striche mit Zahl.
- <span class="ui">Subdivisions</span>: in wie viele Teile ein grosser Schritt mit kleinen Strichen geteilt wird.
- <span class="ui">Decimals</span>: Nachkommastellen der Zahlen, auch der Zahl unter <span class="ui">Readout</span>.
- <span class="ui">Factor</span>: die Zahlen auf der Skala geteilt durch diesen Faktor. Mit 100 steht bei 400 W eine 4, und unter <span class="ui">Unit</span> schreibst du «W × 100».
- <span class="ui">Labels</span>: <span class="ui">Numbers</span> schreibt Zahlen. <span class="ui">E ½ F</span> und <span class="ui">LEER HALB VOLL</span> setzen drei Wörter an Anfang, Mitte und Ende des Bereichs. Jede Beschriftung lässt sich danach ändern, mit <span class="ui">Text</span> und <span class="ui">At</span>, und mit <span class="ui">Add label</span> kommt eine dazu. Dann steht <span class="ui">Custom</span> da. Wer die <span class="ui">Fuel gauge</span> wählt, bekommt E ½ F gleich mit.

### Zones {#zonen}

Ein Bereich der Skala, der auffallen soll, etwa ein fast leerer Tank. Du gibst an, was er bedeutet, nicht welche Farbe er hat: <span class="ui">Danger</span>, <span class="ui">Warning</span> oder <span class="ui">OK</span>, von <span class="ui">From</span> bis <span class="ui">To</span> in den Werten des Topics. Mit <span class="ui">Add zone</span> kommt eine dazu. Jeder Stil zeichnet sie auf seine Art: das Manometer als rote Linie, der VFD mit roten Segmenten, der Kupferstich schraffiert. Wechselst du den Stil, bleiben die Zonen.

## Auf dem Gerät {#geraet}

Das Zifferblatt rechnet der Designer beim Übertragen als Bild in der Grösse des Objekts. Nur die Nadel zeichnet das Gerät selbst, Pixel für Pixel so, wie der Designer sie zeigt. Ein Stil sieht im hellen und im dunklen Theme gleich aus: Ein Messinginstrument wird nachts nicht schwarz.

- Stile brauchen eine Firmware oder App, die sie kennt. Kann ein Gerät sie noch nicht, sagt <span class="ui">Deploy to Device</span> das und bietet die neue Firmware an, siehe [Auf ein Gerät übertragen](/designer/deploy).
- Die Bilder brauchen Speicher. Der Deploy-Dialog zeigt, wie viel: «Styled gauges and bars hold …». Auf dem 4.3B sind vier oder fünf Instrumente von 400 Pixeln auf einmal etwa die Grenze. Kleinere Instrumente kosten viel weniger, eines von 200 Pixeln einen Viertel.
- Auf einem runden Display darf ein Gauge den ganzen Screen füllen. Das Gehäuse des Instruments ist dann der Rand des Displays.
- Auf E-Paper (PaperS3) steht jeder Stil in Graustufen, und die Nadel springt ohne Nachschwingen. Am besten lesbar ist dort der <span class="ui">Engraving</span>.
- Schwingt eine Nadel, zeichnet das Gerät nur den Teil neu, den sie überstreicht. Auf den Boards mit grossem Display (4.3B, 4") sind das rund 15 Bilder pro Sekunde, auf Knob und T-Encoder rund 30.
