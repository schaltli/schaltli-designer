# Anzeigen

Objekte, die etwas zeigen und nichts schalten.

## Text {#text}

Text, den du selbst schreibst, etwa eine Überschrift oder eine Beschriftung. Er kann Werte aus dem Van enthalten, siehe [Werte im Text](#platzhalter).

- <span class="ui">Text</span>: der Text.
- <span class="ui">Text style</span> und <span class="ui">Bold</span>, oder auf älteren Geräten <span class="ui">Font</span>: wie gross und in welcher Schrift, siehe [Stile](#stile).
- <span class="ui">Align</span>: die Ausrichtung.
- <span class="ui">Colour</span>: Textfarbe, Hintergrund und Rahmen. Hintergrund und Rahmen können durchsichtig sein.

Die Höhe richtet sich nach der Schrift. Für einen grösseren Text wählst du einen grösseren Stil.

### Stile {#stile}

<Screenshot narrow name="feld-text-style" alt="Unter Text die Felder Text style und Bold" />

Du wählst für einen Text keine Schrift, sondern einen Stil:

| Stil | wofür |
|---|---|
| <span class="ui">Caption</span> | der kleinste Text, nebenher: eine Einheit, ein Hinweis, eine Uhrzeit |
| <span class="ui">Label</span> | der gewöhnliche Text, der etwas benennt, etwa «Frischwasser» |
| <span class="ui">Title</span> | eine Überschrift, für einen Screen oder einen Abschnitt |
| <span class="ui">Display</span> | ein grosser Wert, etwa «21.5» |

Jeder Stil hat eine feste Grösse in Millimetern. Ein Label ist auf dem kleinen Knob gleich gross wie auf dem 4.3B, der 4.3B hat einfach mehr Platz. Welche Schrift ein Stil bekommt, legt das Gerät fest, der Designer wählt nur die passende Grösse dazu. Mit <span class="ui">Bold</span> wird der Text fett, sofern das Gerät die Schrift in fett hat.

Ein Gerät kann mehrere Typografien mitbringen, jede mit eigenen Schriften für die vier Stile. Knob, 4.3B und PaperS3 haben drei:

| Typografie | Schriften |
|---|---|
| «Standard» | Helvetica, Display in FreeUniversal |
| «Humanist» | Lucida Sans, Display in FreeUniversal |
| «Technic» | Lucida Sans, Title in Logisoso, Display in Sieben-Segment-Ziffern |

<Screenshot name="typografie-technic.webp" alt="Caption, Label, Title und ein Display-Wert in der Typografie Technic auf dem 4.3B" caption="«Technic» auf dem 4.3B" />

Das Display von «Technic» sieht aus wie eine alte Digitalanzeige. Ziffern stehen darin sauber, Buchstaben nur so weit, wie sieben Striche sie hergeben: ein «M» oder «W» ist kaum zu lesen. Nimm Display in «Technic» deshalb für Zahlen. Die Typografie wählst du wie das Theme für einen Master oder einen Screen, unter <span class="ui">Look</span> › <span class="ui">Typography</span>, siehe [Die Eigenschaften eines Screens](/designer/screens#die-eigenschaften-eines-screens).

Neue Objekte beginnen im Stil <span class="ui">Label</span>. Nur der Wert in der Mitte von Gauge und Dial beginnt in <span class="ui">Display</span>, weil er dort allein steht.

Ein Text aus der Zeit vor den Stilen zeigt unter <span class="ui">Text style</span> «Custom» und die Schrift, in der er steht. Er bleibt so, bis du einen Stil wählst. Der Knopf «Snap to …» setzt ihn auf den Stil, der seiner Grösse am nächsten kommt.

Geräte, die ihre Grösse in Millimetern noch nicht angeben, zeigen stattdessen wie bisher <span class="ui">Font</span> mit den Schriften des Geräts.

### Werte im Text {#platzhalter}

Ein Text kann Werte aus dem Van enthalten. Im Feld <span class="ui">Text</span> steht jeder Wert als Chip, etwa «Tank [Level 72] %». Auf dem Display steht an seiner Stelle der Wert, «Tank 72 %», und die Zahl folgt dem Tank. Ein Chip zeigt, woher sein Wert kommt und was er gerade liest. Ein Text kann mehrere Chips haben, jeder liest seinen eigenen Wert.

| Ein Chip liest | zeigt |
|---|---|
| ein Topic | den letzten Wert des Topics. Bei einem JSON-Topic liest er ein Feld, etwa `temp` aus `van/klima`. |
| Device › `model` | das Modell des Geräts, etwa «Waveshare Knob-Touch LCD 1.8», auf dem Handy dessen Verkaufsname wie «HUAWEI P20 Pro» |
| Device › `id` | die Kennung des Geräts, mit der es sich am Broker meldet, etwa «waveshare-knob-1v8-c00f1e13cfd0» |
| Project › `name` | den Namen des Projekts. Er wird beim Übertragen fest eingesetzt. |
| Screen › `name` | den Namen des Screens, auf dem der Text steht. Liegt der Text auf einem [Master](/designer/screens#master-screens), zeigt jeder Screen seinen eigenen Namen. Auch er wird beim Übertragen fest eingesetzt. |

**Einen Wert einfügen:** Tipp `{` oder klick unter dem Feld auf <span class="ui">+ Value</span>. Ein Suchfeld klappt auf, darunter die Topics des Projekts mit Typ und erstem Beispielwert, dann die Felder von Gerät, Projekt und Screen. Gesucht wird im Pfad und im Beispielwert, `frisch` findet also auch das Topic mit dem Beispiel «Frischwasser». Mit den Pfeiltasten wählst du aus, <kbd>Enter</kbd> oder <kbd>Tab</kbd> setzt den Chip dort ein, wo der Cursor stand. <kbd>Esc</kbd> schliesst die Suche, ohne etwas einzufügen.

**Mit Chips schreiben:** Ein Chip zählt als ein Zeichen. Die Pfeiltasten springen über ihn, <kbd>Backspace</kbd> und <kbd>Entf</kbd> löschen ihn ganz. Kopierst du Text samt Chips in einen anderen Text, kommen die Chips mit. Fügst du einen Platzhalter ein, wie ihn ältere Projekte schrieben, etwa `{topic:van/temp:F1}`, wird daraus ein Chip.

**Wie ein Wert erscheint:** Ein Klick auf einen Chip öffnet unter dem Feld seine Einstellungen, ebenso <kbd>Enter</kbd>, wenn der Cursor gleich hinter dem Chip steht. Ein neu eingefügter Chip öffnet sie von selbst. Der Chip, dessen Einstellungen offen sind, ist blau ausgefüllt. Oben in den Einstellungen steht derselbe Chip, bei mehreren Chips auch, der wievielte er ist, und ein kleiner Pfeil zeigt auf ihn im Text. Mit den Pfeilen daneben gehst du zum Chip davor oder danach, <kbd>Esc</kbd> führt zurück in den Text.

- <span class="ui">Reads</span>: woher der Wert kommt.
- <span class="ui">Value shown as</span>: wie der Wert geschrieben wird. <span class="ui">As it arrives</span> zeigt ihn genau so, wie er ankommt. <span class="ui">Number</span> rundet auf 0 bis 3 Nachkommastellen, kaufmännisch, mit <span class="ui">grouped</span> auch mit Tausendertrennzeichen. <span class="ui">Duration</span> liest Sekunden als Dauer: Aus 12198 wird `3:23:18`, `3:23` oder `203:18`. Eine Zahl aus einem Topic vom Typ numeric beginnt mit einer Nachkommastelle. Welches Zeichen vor den Nachkommastellen steht und welches die Tausender trennt, stellst du unter <span class="ui">Settings</span> › <span class="ui">Project Properties</span> › <span class="ui">Number format</span> ein, siehe [Projekteinstellungen](/designer/projekte#projekteinstellungen).
- Regeln, mit <span class="ui">+ Add rule</span>: Eine Regel vergleicht den Wert und sagt, was dann dasteht. Die Regeln werden von oben gelesen, die erste passende gilt. `<`, `<=`, `>` und `>=` vergleichen Zahlen; Text, der keine Zahl ist, passt nie. `==` und `!=` vergleichen Text. «is yes» passt auf `true`, `on`, `yes`, `1` und jede Zahl ausser 0, «is no» auf `false`, `off`, `no`, `0` und eine leere Nachricht. Liefert ein Topic als Beispiele solche Wörter, bietet der Designer gleich <span class="ui">+ is yes / is no</span> an.
- <span class="ui">Otherwise</span>: was dasteht, wenn keine Regel passt. Ohne eigene Eingabe ist das der Wert selbst.
- <span class="ui">No value yet</span>: was dasteht, solange nach dem Einschalten noch nichts angekommen ist. Leer bleibt die Stelle leer.

**Ausprobieren:** Unten in den Einstellungen steht ein Testwert, zu Beginn der erste Beispielwert des Topics, bei Zahlen mit einem Schieber. Die Regel, die bei diesem Wert gilt, ist blau umrandet, und der Screen zeigt den Wert so, wie ihn das Gerät zeigen würde. Mit <span class="ui">No value has arrived yet</span> siehst du, was nach dem Einschalten dasteht. Schliesst du die Einstellungen, zeigt der Screen wieder den Beispielwert.

In einem Ergebnis schreibt `{value}` den Wert in seinem Format, etwa `noch {value}`. Ein leeres Ergebnis lässt den Chip ganz verschwinden. Ein Leerzeichen, das mit verschwinden soll, gehört deshalb ins Ergebnis und nicht davor in den Text. So zeigt «Heizung [status][timer]» mit dem Timer-Ergebnis ` timer {value}` und der Regel «== 0 → leer» entweder «Heizung läuft timer 3:23:18» oder «Heizung aus».

::: v-pre
**Klammern als Zeichen** schreibst du doppelt: Ein zweites `{` gleich nach dem ersten schliesst die Suche und schreibt `{{`. Auf dem Display steht dann eine Klammer.
:::

Steht im Text etwas in Klammern, das weder Chip noch Klammer als Zeichen ist, etwa aus der Zwischenablage, zeigt das Gerät es so, wie es dasteht. Unter dem Feld nennt dann eine rote Zeile den Grund.

### Aus Live Text wird Text {#live-text}

Früher gab es für einen Wert aus einem Topic ein eigenes Objekt, Live Text. Ein Text mit Chip kann dasselbe, darum gibt es Live Text nicht mehr. Öffnest du ein Projekt, das noch Live Text enthält, macht der Designer daraus einen Text: Das Topic wird zu einem Chip mit seinen Nachkommastellen, Präfix und Suffix stehen als Text davor und danach, etwa «Innen [temp 21.4] °C». Schrift, Ausrichtung und Farben bleiben. Zwei Dinge sind danach anders. Bevor ein Wert da ist, stehen Präfix und Suffix schon da, wo Live Text leer blieb. Und die Tausender trennt das Zeichen aus den Projekteinstellungen, nicht mehr eines pro Objekt.

::: warning Ältere Firmware
Knob, 4.3B, PaperS3 und die Android-App zeigen einen Wert im Text, so wie er ankommt oder als Zahl, ab Systemgeneration 1.2. Regeln, ein eigenes <span class="ui">Otherwise</span>, eine <span class="ui">Duration</span> und Combined topics brauchen die Systemgeneration 1.4. Mit älterer Firmware oder einer älteren App steht an Stelle eines Chips ein Platzhalter wie `{topic:…}` auf dem Display, oder die Stelle bleibt leer. Überträgst du auf ein solches Gerät, warnt der Designer und nennt die betroffenen Texte. Abhilfe schafft ein [Firmware-Update](/geraete/firmware-updates) oder eine neue App.
:::

## Icon {#icon}

Ein Bild aus der Icon-Sammlung des Projekts, immer quadratisch.

- <span class="ui">Icon</span>: <span class="ui">Fixed</span> zeigt immer dasselbe Icon. Die Icons selbst verwaltest du unter <span class="ui">Settings</span> › <span class="ui">Assets</span>, siehe [Icons und Schriften](/designer/icons-schriften). <span class="ui">Live</span> zeigt je nach Wert ein anderes, siehe unten. <span class="ui">Screen</span> zeigt das Icon des Screens, auf dem es steht, siehe ebenfalls unten.
- <span class="ui">Colour</span>: die Farbe des Icons und der Hintergrund, der anfangs durchsichtig ist. Bei einem Icon mit <span class="ui">Live</span> gilt die Farbe für alle seine Icons.
- <span class="ui">Size</span>: wie gross das Icon ist, in vier Stufen, <span class="ui">XS</span>, <span class="ui">S</span>, <span class="ui">M</span> und <span class="ui">L</span> (3, 4, 6 und 9 mm), wie beim [Bar](#bar). Auf älteren Geräten fehlt das Feld.

In Pixeln stellst du die Grösse unter <span class="ui">Frame</span> als <span class="ui">Width</span> ein, die Höhe folgt.

**Ein Icon, das sich mit einem Wert ändert:** Mit <span class="ui">Live</span> liest das Icon einen Wert und zeigt je nach Wert ein anderes Icon, etwa eine Schneeflocke, wenn es draussen kalt wird. Die Einstellungen sind dieselben wie bei einem [Wert im Text](#platzhalter): <span class="ui">Reads</span>, Regeln mit <span class="ui">+ Add rule</span>, <span class="ui">Otherwise</span> und <span class="ui">No value yet</span>. Nur steht in jeder Regel statt eines Texts ein Icon, das du mit einem Klick aus der Icon-Sammlung wählst. Das bisherige Icon wird zu <span class="ui">Otherwise</span>, es steht also da, solange keine Regel passt. Unter den Regeln zeigt <span class="ui">This rule can show</span> alle Icons, die vorkommen können.

Eine Frostwarnung sieht so aus: <span class="ui">Reads</span> ist die Aussentemperatur, «If value < 0» zeigt ein Warnsymbol, «If value < 3» eine Schneeflocke, <span class="ui">Otherwise</span> ein Thermometer. Die Regeln werden von oben gelesen, bei 1.5 °C passt also die zweite.

Stellst du zurück auf <span class="ui">Fixed</span>, bleibt das Icon aus <span class="ui">Otherwise</span>.

Früher gab es für ein Icon, das sich mit einem Wert ändert, ein eigenes Objekt, Live Icon. Ein Icon mit <span class="ui">Live</span> kann dasselbe, darum gibt es Live Icon nicht mehr. Öffnest du ein Projekt, das noch Live Icons enthält, macht der Designer aus jedem ein Icon mit <span class="ui">Live</span>. Das Topic wird zu <span class="ui">Reads</span>, die Regeln behalten ihre Reihenfolge, und Farbe, Hintergrund und Grösse bleiben, wie sie waren. <span class="ui">Otherwise</span> bleibt leer: Passt keine Regel, zeigt das Icon wie bisher nichts. Anders ist nur `==`, es vergleicht jetzt Text. «1.0» passt also nicht mehr auf eine Regel mit 1.

**Das Icon des Screens:** Mit <span class="ui">Screen</span> zeigt das Icon dasselbe wie der Screen, auf dem es steht, also das Icon aus seinen Eigenschaften, ob fest oder live. Gedacht ist das für einen [Master](/designer/screens#master-screens): Eine Kopfzeile aus diesem Icon und einem Text mit dem Chip Screen › `name` legst du einmal an, und jeder Screen zeigt darin sein eigenes Icon und seinen eigenen Namen. Das Icon im Feld <span class="ui">Stand-in</span> springt ein, wo ein Screen kein Icon hat, und auf dem Master selbst. Hat das Icon noch keine Farbe, bekommt es mit <span class="ui">Screen</span> die Rolle <span class="ui">Text</span>, wie die Icons im Navigator. So bleibt es auch in einem dunklen Theme gut sichtbar. Bei einem Icon, das du schon vorher auf <span class="ui">Screen</span> gestellt hast, wählst du die Farbe unter <span class="ui">Colour</span> selbst. Name und Icon setzt der Designer beim Übertragen für jeden Screen fest ein. Das Gerät braucht dafür keine neue Firmware.

::: warning Ältere Firmware
Ein Icon mit <span class="ui">Live</span> wechselt auf Geräten ab Systemgeneration 1.4. Knob, 4.3B und PaperS3 mit älterer Firmware zeigen immer das Icon aus <span class="ui">Otherwise</span>, eine ältere Android-App zeigt keines. Überträgst du auf ein solches Gerät, nennt der Dialog diese Icons.
:::

## Bar {#bar}

Ein Balken, der einen Füllstand zeigt: Tank, Batterie, Auslastung. Ablesen, nicht einstellen; dafür gibt es den [Slider](/objekte/bedienen#slider). Ein [Baustein](/designer/bausteine) aus einem Messwert in Prozent setzt einen Bar und darüber einen [Text](#text) mit seinem Namen.

Einen eigenen Namen oder ein Icon hat der Bar nicht. Soll dabeistehen, was er anzeigt, setzt du einen Text oder ein [Icon](#icon) neben den Balken. Fasst du beides zu einer [Gruppe](/objekte/anordnen#gruppe) zusammen, bleibt es beim Verschieben beisammen. Der Text kann [Werte](#platzhalter) enthalten, etwa den Namen, den dein Van dem Tank gibt.

- <span class="ui">Show value</span>: am Ende des Balkens nichts (<span class="ui">None</span>), den Wert (<span class="ui">Value</span>) oder den Füllstand in Prozent (<span class="ui">Percentage</span>). Bei einem waagrechten Balken steht die Zahl rechts, bei einem senkrechten darunter.
- <span class="ui">Text style</span> und <span class="ui">Bold</span> (oder <span class="ui">Font</span>): wie gross die Zahl steht, siehe [Stile](#stile).
- <span class="ui">Topic</span>: der gemessene Wert.
- <span class="ui">Direction</span>: in welche Richtung sich der Balken füllt.
- <span class="ui">Size</span>: wie dick der Balken ist, in vier Stufen, <span class="ui">XS</span>, <span class="ui">S</span>, <span class="ui">M</span> und <span class="ui">L</span> (1.15, 1.7, 2.9 und 4.6 mm, auf dem 4.3B 10, 15, 25 und 40 Pixel). Bar, Slider, Gauge und Dial haben dieselben Stufen, ihre Balken und Ringe sind also gleich dick. Beim Slider steht der Anfasser über den Balken hinaus. Ein neuer Bar beginnt in <span class="ui">M</span>. Passt die Dicke zu keiner Stufe, etwa bei einem Balken aus der Zeit vor den Stufen, steht «Custom» mit der Dicke in Pixeln da, und «Snap to …» setzt ihn auf die nächste Stufe. Auf älteren Geräten fehlt das Feld.
- <span class="ui">Thickness</span>: wie dick der Balken ist, in Pixeln. Das Objekt kann grösser sein, der Balken steht dann in seiner Mitte. Tippst du hier eine Zahl ein, gilt keine Stufe mehr.

Ein neuer Bar ist 30 mm lang. Hat er eine Stufe, änderst du an seinen Anfassern nur noch die Länge. Dicker oder dünner wird er über <span class="ui">Size</span>.

<Screenshot narrow name="feld-size" alt="Unter Shape die Felder Size, Direction, Thickness und Setpoint topic eines Sliders" />
- <span class="ui">Setpoint topic</span>: ein Sollwert, den die Anlage meldet. Ein kleines Dreieck unter dem Balken zeigt auf ihn, bei einem senkrechten Balken steht es rechts daneben. Einen Anfasser wie der Slider hat der Bar nicht: Verschieben lässt er sich nicht.
- <span class="ui">Calibration</span>: welcher Wert welchem Füllstand entspricht, siehe [Kalibrierung](/objekte/gemeinsames#kalibrierung). Ohne eigene Punkte ist 0 leer und 100 voll.
- <span class="ui">Colour</span>: <span class="ui">Fill</span> ist die Farbe des gefüllten Teils, <span class="ui">Track</span> die des leeren, <span class="ui">Track edge</span> ein Rand darum. Track und Rand kommen aus dem [Theme](/designer/themes#rollen), bis du sie änderst. Mit der Rolle <span class="ui">Accent</span> läuft die Füllung in einem Verlauf, siehe [Verlauf](/designer/themes#verlauf).

Ohne Wert zeigt der Bar nur den leeren Balken.

## Gauge {#gauge}

Wie Bar, aber als Ring: ein Füllstand auf einem Kreisbogen, der Wert in der Mitte. Immer quadratisch.

- <span class="ui">Show value</span>, <span class="ui">Text style</span>, <span class="ui">Topic</span>, <span class="ui">Setpoint topic</span>, <span class="ui">Calibration</span> und <span class="ui">Fill</span> wie beim Bar. Das Dreieck für den Sollwert steht aussen am Ring und zeigt zur Mitte.
- <span class="ui">Show value</span> kennt beim Ring zusätzlich <span class="ui">Duration</span>. Der Wert gilt dann als Sekunden und steht als Stunden, Minuten und Sekunden in der Mitte, aus 5009 wird 1:23:29. So sieht man einer Restzeit an, dass sie abläuft. Auf einem Gerät geht das ab der nächsten Firmware-Release und App-Version; Deploy sagt es, wenn eines es noch nicht kann.
- <span class="ui">Angles</span>: wo der Bogen beginnt und endet, in Grad, 0 ist oben. Voreingestellt ist ein Dreiviertelkreis. Die Enden lassen sich auch auf dem Screen an ihren Anfassern ziehen.
- <span class="ui">Direction</span>: im oder gegen den Uhrzeigersinn.
- <span class="ui">Size</span>: wie dick der Ring ist, dieselben Stufen wie beim Bar. Den Durchmesser ziehst du auf dem Screen, in Pixeln steht er unter <span class="ui">Frame</span> als <span class="ui">Diameter</span>. Hat der Ring eine Stufe, springt der Durchmesser beim Ziehen um zwei Ringdicken. Zwei Ringe mit derselben Stufe lassen sich so genau ineinander setzen. In einer Tabelle bestimmst du den Durchmesser ebenfalls selbst unter <span class="ui">Diameter</span>, und seine Spalte richtet sich danach.
- <span class="ui">Thickness</span>: wie breit der Ring ist, höchstens die Hälfte des Objekts.

Ohne Wert zeigt der Gauge nur den leeren Ring.

## Energy diagram {#energiediagramm}

Zeigt, woher die Energie im Van kommt und wohin sie geht: Sonne, Landstrom und Ladebooster auf der einen Seite, Batterie und Verbraucher auf der anderen, alles verbunden über den 12-V-Bus. Ein neues Diagramm bringt den Bus und drei Knoten mit: «Solar», «Storage» und «Consumers».

Diese drei sind nur ein Anfang. Wie viele Knoten das Diagramm zeigt und welche, legst du selbst fest, damit es zu deinem Van passt. Vielleicht hast du zwei Batterien, zwei Ladebooster oder gar keinen, und einige Verbraucher misst du einzeln, etwa den Wechselrichter. Jeder Knoten liest sein eigenes Topic, und das kann jedes Topic auf deinem Broker sein. So bekommt jedes Gerät, das seine Leistung meldet, seinen Knoten.

Ein Van mit zwei Solarladereglern, «PV Dach» und «Solartasche», und zwei Batterien, am Mittag. Derselbe Moment einmal als Flow und einmal als Sankey:

<Screenshot name="energie-flow.webp" alt="Energiediagramm als Flow: PV Dach und Solartasche links, Batterie 1 und Batterie 2 unten, Kühlschrank und Verbraucher rechts, alle mit Linien zum Bus in der Mitte" caption="Flow" />

<Screenshot name="energie-sankey.webp" alt="Dasselbe Energiediagramm als Sankey: PV Dach und Solartasche links, rechts Kühlschrank, Verbraucher und die beiden Batterien, dazwischen der Bus" caption="Sankey" />

Wie die Zahlen darin zustande kommen, steht unter [So rechnet das Diagramm](#energie-rechnung).

::: info Ab fw-2026.10.13.1 und App 0.10.0
Das Energiediagramm zeigen der 4.3B, der Knob und das PaperS3 ab der Firmware fw-2026.10.13.1, die Android-App ab Version 0.10.0. Eine ältere Version zeigt es nicht: «Deploy» bringt die Firmware vorher auf den neuen Stand und bittet bei der App um ein Update. Auf dem PaperS3 steht das Diagramm still.
:::

Das Diagramm hat zwei Darstellungen, die du unter <span class="ui">Mode</span> wählst. Die Knoten bleiben beim Umschalten dieselben.

- <span class="ui">Flow</span>: jeder Knoten ein Kreis, mit einer Linie zum Bus. Je mehr fliesst, desto dicker die Linie. Punkte laufen darauf vom Geber zum Bus und vom Bus zum Nehmer, überall gleich schnell. Je mehr Leistung, desto dichter folgen sie sich: bei 1 W etwa alle 3 Sekunden einer, ab 1000 W ein dichter Strom. Ein Knoten ohne Leistung ist grau. Um die Batterie liegt eine breite Spur in ihrer Farbe, fast durchsichtig, darauf ein Balken mit dem Ladestand. Die Punkte laufen am Kreis in die Spur weiter: im Balken ein Stück weit, bis sie verglimmen, in der leeren Spur blasser bis zum Balken. Die Kreise schiebst du bei ausgewähltem Diagramm mit der Maus dorthin, wo sie stehen sollen.
- <span class="ui">Sankey</span>: Geber links, Nehmer rechts, dazwischen der Bus, verbunden durch Bänder. Ein Band ist so breit, wie Leistung fliesst. Ein Knoten ohne Leistung fehlt, solange anderswo etwas fliesst. Fliesst nirgends etwas, stehen alle Knoten und der Bus dünn und grau da. Durch die Bänder läuft langsam eine Welle. Die Reihenfolge von oben nach unten änderst du, indem du die Knoten in der Liste verschiebst.

Die Eigenschaften:

- <span class="ui">Motion</span>: ob sich Punkte und Wellen bewegen. Ausgeschaltet steht das Diagramm still. Auf dem 4.3B und dem Knob bewegen sie sich etwa zehnmal pro Sekunde und halten an, solange ein Finger auf dem Glas liegt, damit ein Tipp nicht warten muss. Ein Diagramm in einem Switcher oder einem Popup bewegt sich dort ab der Firmware fw-2026.10.13.2, mit älterer steht es still. Beim PaperS3 fehlt das Feld: E-Paper zeigt keine Bewegung, das Diagramm steht dort mit seinen Punkten still, auch in der Vorschau des Designers.
- <span class="ui">Full scale</span>, nur beim Sankey: die Leistung in Watt, bei der die Bänder den Platz füllen, voreingestellt 1000 W. Die Breite ist linear, 200 W sind also doppelt so breit wie 100 W. Ist ein Wechselrichter für einen Induktionsherd eingebaut, setzt du hier seine Leistung ein: Dann ist der Kühlschrank ein dünner Faden und der Herd füllt das Bild.
- <span class="ui">Font</span> und <span class="ui">Value font</span>: die Schrift für Namen und Nebenzeilen und die für die erste Zeile jedes Knotens, meist die Leistung.
- <span class="ui">Nodes</span>: die Liste der Knoten. Mit <span class="ui">+ Add node</span> kommt einer dazu.

Ein Knoten hat eine Rolle:

| Rolle | was er ist |
|---|---|
| <span class="ui">Source</span> | gibt Energie ab: Sonne, Landstrom, Ladebooster |
| <span class="ui">Sink</span> | nimmt Energie: ein Verbraucher, den du misst, etwa der Kühlschrank |
| <span class="ui">Storage</span> | nimmt beim Laden, gibt beim Entladen: die Batterie |
| <span class="ui">Rest</span> | was hereinkommt und nirgends gemessen hinausgeht, also was der Van sonst braucht. Der Designer rechnet ihn aus, er hat kein Topic. Höchstens einer pro Diagramm. |
| <span class="ui">Bus</span> | wo alle Linien zusammenkommen. Genau einer, er lässt sich nicht löschen. |

Der Bus steht für die 12-V-Leitung, an der im Van alles hängt. Er misst nichts und hat kein Topic. Jede Linie führt von einem Knoten zu ihm oder von ihm weg, denn welches Gerät welches speist, misst niemand: Was hereinkommt, landet am Bus, und was genommen wird, kommt von dort. Lädt die Sonne die Batterie und betreibt gleichzeitig den Kühlschrank, siehst du darum drei Linien am Bus, aber keine von der Sonne direkt zum Kühlschrank.

Der Rest steht für alles, was im Van Strom braucht, ohne dass es gemessen wird: Licht, Wasserpumpe, Router. Ein Topic hat er nicht, das Diagramm rechnet ihn aus. Wie, steht unter [So rechnet das Diagramm](#energie-rechnung). Kaum ein Van misst jeden Verbraucher einzeln. Mit dem Rest siehst du trotzdem, was der Van insgesamt braucht, wenn du nur misst, was hereinkommt, und dazu die Batterie. Ist wirklich jeder Verbraucher ein eigener Knoten, bleibt der Rest bei 0 und du kannst ihn löschen.

Seine Felder:

- <span class="ui">Name</span> und <span class="ui">Icon</span>.
- <span class="ui">Reads</span>: das Topic mit der Leistung in Watt. Eine Batterie liefert positive Werte beim Laden. Zählt dein Topic andersherum, schaltest du <span class="ui">Reverse sign</span> ein.
- <span class="ui">Charge</span>, nur bei der Batterie: das Topic mit dem Ladestand in Prozent, für den Ring.
- <span class="ui">Colour</span>: eine der Rollen <span class="ui">Sun</span>, <span class="ui">Grid</span>, <span class="ui">Engine</span> oder <span class="ui">Load</span>, oder eine eigene Farbe. Die Rollen haben in jedem Theme dieselben Farben. Die Batterie hat keine eigene Farbe: Sie ist grün beim Laden (<span class="ui">Charging</span>) und rot beim Entladen (<span class="ui">Discharging</span>).
- Bis zu drei Zeilen unter dem Namen, jede ein Text mit Werten wie bei einem [Text](#platzhalter). `{watts}` steht für die Leistung des Knotens, so wie das Diagramm sie verwendet: mit umgedrehtem Vorzeichen, falls eingestellt, und beim Rest ausgerechnet. Die erste Zeile ist anfangs `{watts} W`. Weitere Zeilen kommen mit <span class="ui">Add line</span> dazu.
- <span class="ui">Tap</span>: was ein Antippen des Knotens tut, etwa <span class="ui">Open a popup</span> mit den Details zur Batterie. In der Vorschau probierst du es aus.

Solange ein Topic nichts geliefert hat, zählt der Knoten mit 0 W und `{watts}` zeigt einen Bindestrich.

### So rechnet das Diagramm {#energie-rechnung}

Pro Knoten braucht das Diagramm eine einzige Zahl: wie viel Watt gerade fliessen. Woher sie kommt, spielt keine Rolle. Es kann ein Topic deiner Steuerung sein, ein Feld aus einer JSON-Nachricht (`topic#feld`) oder ein Sensor aus Home Assistant. Besondere Entities braucht es nicht. Meldet ein Gerät nur Ampere, rechnest du die Watt dort aus, wo der Wert entsteht, also in deiner Steuerung oder einem Flow. Das Diagramm selbst multipliziert nicht.

Mit diesen Zahlen geht es so um:

1. Ist bei einem Knoten <span class="ui">Reverse sign</span> eingeschaltet, dreht es zuerst sein Vorzeichen um.
2. Eine <span class="ui">Source</span> gibt ab, ein <span class="ui">Sink</span> nimmt. Ist ihr Wert negativ, zählt er als 0.
3. Eine Batterie (<span class="ui">Storage</span>) nimmt, solange ihr Wert positiv ist, und gibt ab, solange er negativ ist.
4. Der <span class="ui">Rest</span> ist alles, was abgegeben wird, weniger dem, was gemessen genommen wird. Unter 0 fällt er nie.

Der Van aus den Bildern oben, am Mittag. Gemessen werden die beiden Solarladeregler, jede Batterie über ihren Shunt und der Kühlschrank:

| Knoten | Rolle | das Topic meldet | im Diagramm |
|---|---|---|---|
| PV Dach | <span class="ui">Source</span> | 280 | gibt 280 W ab |
| Solartasche | <span class="ui">Source</span> | 90 | gibt 90 W ab |
| Batterie 1 | <span class="ui">Storage</span> | 180 | nimmt 180 W |
| Batterie 2 | <span class="ui">Storage</span> | 90 | nimmt 90 W |
| Kühlschrank | <span class="ui">Sink</span> | 45 | nimmt 45 W |
| Verbraucher | <span class="ui">Rest</span> | (keins) | 280 + 90 − 180 − 90 − 45 = 55 W |

Die 55 W sind alles, was niemand misst: Licht, Wasserpumpe, Router. Am Abend ohne Sonne meldet Batterie 1 −40 und Batterie 2 −20, zusammen geben sie also 60 W ab. Der Kühlschrank nimmt davon 45 W, für den Rest bleiben 15 W.

## Chart {#chart}

Zeigt Werte über die Zeit: wie sich die Batterie über den Tag geladen hat, wie kalt es in der Nacht wurde, wann die Heizung lief. Den Verlauf sammelt der [Recorder](/betrieb/daten#verlauf) auf dem Pekaway-System. Das Diagramm zeigt, was er gesammelt hat.

::: warning Geräte
Noch zeigt kein Gerät ein Diagramm. Du kannst eines bauen und in der [Vorschau](/designer/vorschau) ansehen, «Deploy» überträgt ein Projekt mit Diagramm aber noch auf kein Gerät. 4.3B, Knob, PaperS3 und die Android-App lernen es mit ihrer nächsten Version.
:::

Ein neues Diagramm ist leer. Unter <span class="ui">Series</span> wählst du bei <span class="ui">Add a series from a topic…</span> ein Topic oder ein Feld aus einer JSON-Nachricht. Daraus wird eine Datenreihe, gezeichnet als Linie, Fläche oder Band. Ein Diagramm kann mehrere Datenreihen haben.

Jede Datenreihe hat unter <span class="ui">Kind</span> eine Art:

- <span class="ui">Level</span>: ein Stand, etwa Ladestand, Temperatur oder Tank.
- <span class="ui">Power</span>: eine Leistung in Watt, positiv oder negativ. Daraus rechnet das Diagramm die Energie in Wh und kWh.
- <span class="ui">State</span>: ein Zustand wie «Heizung an». Er erscheint als Band am unteren Rand, für die Zeit, in der er an war.

Die Art errät der Designer beim Hinzufügen. Kennt das Topic als Beispielwerte nur on und off, wird es ein <span class="ui">State</span>, sonst ein <span class="ui">Level</span>. Liegt er falsch, stellst du es unter <span class="ui">Kind</span> um.

Die übrigen Felder einer Datenreihe:

- <span class="ui">Reads</span>: das Topic. <span class="ui">Name</span> steht in der Legende.
- <span class="ui">Drawn as</span>: <span class="ui">Line</span>, <span class="ui">Area</span>, <span class="ui">Steps</span> oder <span class="ui">Stacked</span>. Gestapelte Leistungen liegen übereinander: was gibt, über null, was nimmt, darunter.
- <span class="ui">Factor</span> rechnet den Wert um, etwa 0.001 für mV in V. <span class="ui">Unit</span> und <span class="ui">Decimals</span> bestimmen, wie er geschrieben wird.
- <span class="ui">Reverse sign</span> dreht eine Leistung um, die dein Gerät andersherum zählt.
- <span class="ui">Axis</span> legt eine Datenreihe mit anderer Einheit auf die rechte Achse.
- <span class="ui">Range</span> zeigt blass um die Linie, wie weit der Wert in jeder Viertelstunde schwankte.
- <span class="ui">Shows</span>: was in der Legende steht. Zur Wahl stehen der Wert jetzt, der kleinste und der grösste Wert im Fenster mit ihrer Uhrzeit, die Energie, wie lange etwas lief und wie oft es anging.

Für das ganze Diagramm wählst du unter <span class="ui">Mode</span> zwischen <span class="ui">Over time</span>, einer Kurve über die Zeit, und <span class="ui">Per day</span>, einem Balken pro Tag für die letzten <span class="ui">Days</span> Tage. <span class="ui">Legend</span> setzt die Legende oben rechts, oben links oder unten, oder blendet sie aus. Unter <span class="ui">Left axis</span> stellst du <span class="ui">Scale</span> auf <span class="ui">Automatic</span>, auf <span class="ui">Fixed</span> mit festem Bereich oder auf <span class="ui">At least</span>: ein Bereich, der wächst, wenn ein Wert herausfällt. <span class="ui">Zones</span> färbt Bereiche einer Achse ein, etwa einen Ladestand unter 20 %.

Welche Zeitspanne ein Diagramm zeigt, bestimmt sein Screen unter <span class="ui">Time range</span>: 1 Stunde, 6 Stunden, 24 Stunden oder 7 Tage. 24 Stunden sind der heutige Tag von Mitternacht bis Mitternacht. Ein Punkt markiert den Moment jetzt, rechts davon ist der Tag noch leer.

In der Vorschau mit <span class="ui">Live</span> zeigt das Diagramm, was der Recorder auf den Broker gelegt hat. Läuft keiner, steht «No recorder on this broker» darin, hat er noch nichts gesammelt, «No history yet». Mit <span class="ui">Simulation</span> und beim Bearbeiten zeichnet der Designer eine Kurve aus den Beispielwerten der Topics.
