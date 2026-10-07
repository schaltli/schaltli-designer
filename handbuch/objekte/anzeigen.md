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

**Einen Wert einfügen:** Tipp `{` oder klick unter dem Feld auf <span class="ui">+ Value</span>. Ein Suchfeld klappt auf, darunter die Topics des Projekts mit Typ und erstem Beispielwert, dann die Felder von Gerät und Projekt. Gesucht wird im Pfad und im Beispielwert, `frisch` findet also auch das Topic mit dem Beispiel «Frischwasser». Mit den Pfeiltasten wählst du aus, <kbd>Enter</kbd> oder <kbd>Tab</kbd> setzt den Chip dort ein, wo der Cursor stand. <kbd>Esc</kbd> schliesst die Suche, ohne etwas einzufügen.

**Mit Chips schreiben:** Ein Chip zählt als ein Zeichen. Die Pfeiltasten springen über ihn, <kbd>Backspace</kbd> und <kbd>Entf</kbd> löschen ihn ganz. Kopierst du Text samt Chips in einen anderen Text, kommen die Chips mit. Fügst du einen Platzhalter ein, wie ihn ältere Projekte schrieben, etwa `{topic:van/temp:F1}`, wird daraus ein Chip.

**Wie ein Wert erscheint:** Eine Zahl aus einem Topic vom Typ numeric zeigt der Chip mit einer Nachkommastelle, gerundet wird kaufmännisch. Welches Zeichen vor den Nachkommastellen steht und welches die Tausender trennt, stellst du unter <span class="ui">Settings</span> › <span class="ui">Project Properties</span> › <span class="ui">Number format</span> ein, siehe [Projekteinstellungen](/designer/projekte#projekteinstellungen). Alles andere zeigt das Gerät genau so, wie es ankommt. Solange nach dem Einschalten noch kein Wert da ist, bleibt die Stelle leer.

::: v-pre
**Klammern als Zeichen** schreibst du doppelt: Ein zweites `{` gleich nach dem ersten schliesst die Suche und schreibt `{{`. Auf dem Display steht dann eine Klammer.
:::

Steht im Text etwas in Klammern, das weder Chip noch Klammer als Zeichen ist, etwa aus der Zwischenablage, zeigt das Gerät es so, wie es dasteht. Unter dem Feld nennt dann eine rote Zeile den Grund.

### Aus Live Text wird Text {#live-text}

Früher gab es für einen Wert aus einem Topic ein eigenes Objekt, Live Text. Ein Text mit Chip kann dasselbe, darum gibt es Live Text nicht mehr. Öffnest du ein Projekt, das noch Live Text enthält, macht der Designer daraus einen Text: Das Topic wird zu einem Chip mit seinen Nachkommastellen, Präfix und Suffix stehen als Text davor und danach, etwa «Innen [temp 21.4] °C». Schrift, Ausrichtung und Farben bleiben. Zwei Dinge sind danach anders. Bevor ein Wert da ist, stehen Präfix und Suffix schon da, wo Live Text leer blieb. Und die Tausender trennt das Zeichen aus den Projekteinstellungen, nicht mehr eines pro Objekt.

::: warning Ältere Firmware
Knob, 4.3B, PaperS3 und die Android-App zeigen Werte im Text ab Systemgeneration 1.2. Mit älterer Firmware oder einer älteren App steht an Stelle eines Chips ein Platzhalter wie `{topic:…}` auf dem Display. Überträgst du auf ein solches Gerät, warnt der Designer. Abhilfe schafft ein [Firmware-Update](/geraete/firmware-updates) oder eine neue App. Das auslaufende E-Paper-Display lernt Werte im Text nicht mehr.
:::

## Icon {#icon}

Ein Bild aus der Icon-Sammlung des Projekts, immer quadratisch.

- <span class="ui">Icon</span>: welches. Die Icons selbst verwaltest du unter <span class="ui">Settings</span> › <span class="ui">Assets</span>, siehe [Icons und Schriften](/designer/icons-schriften).
- <span class="ui">Colour</span>: die Farbe des Icons und der Hintergrund, der anfangs durchsichtig ist.
- <span class="ui">Size</span>: wie gross das Icon ist, in vier Stufen, <span class="ui">XS</span>, <span class="ui">S</span>, <span class="ui">M</span> und <span class="ui">L</span> (3, 4, 6 und 9 mm), wie beim [Bar](#bar). Auf älteren Geräten fehlt das Feld.

In Pixeln stellst du die Grösse unter <span class="ui">Frame</span> als <span class="ui">Width</span> ein, die Höhe folgt.

## Live Icon {#live-icon}

Zeigt eines von mehreren Icons, je nach Wert eines Topics: eine leere oder volle Batterie, eine Lampe an oder aus.

- <span class="ui">Topic</span>: woher der Wert kommt.
- <span class="ui">Rules</span>: eine Liste von Regeln der Form <span class="ui">If value</span> … <span class="ui">Then</span> …, zum Beispiel «wenn Wert > 80, dann Icon Batterie voll». Die Regeln werden von oben gelesen, die erste passende bestimmt das Icon. Passt keine, zeigt Live Icon nichts. <span class="ui">Add rule</span> fügt eine Regel hinzu. Wie Vergleiche funktionieren, steht unter [Bedingungen](/objekte/gemeinsames#bedingungen).
- <span class="ui">Colour</span>: eine Farbe für alle Icons, und der Hintergrund.
- <span class="ui">Size</span>: wie beim [Icon](#icon).

## Bar {#bar}

Ein Balken, der einen Füllstand zeigt: Tank, Batterie, Auslastung. Ablesen, nicht einstellen; dafür gibt es den [Slider](/objekte/bedienen#slider). Ein [Baustein](/designer/bausteine) aus einem Messwert in Prozent setzt einen Bar und darüber einen [Text](#text) mit seinem Namen.

Einen eigenen Namen oder ein Icon hat der Bar nicht. Soll dabeistehen, was er anzeigt, setzt du einen Text oder ein [Icon](#icon) neben den Balken. Fasst du beides zu einer [Gruppe](/objekte/anordnen#gruppe) zusammen, bleibt es beim Verschieben beisammen. Der Text kann [Werte](#platzhalter) enthalten, etwa den Namen, den dein Van dem Tank gibt.

- <span class="ui">Show value</span>: am Ende des Balkens nichts (<span class="ui">None</span>), den Wert (<span class="ui">Value</span>) oder den Füllstand in Prozent (<span class="ui">Percentage</span>). Bei einem waagrechten Balken steht die Zahl rechts, bei einem senkrechten darunter.
- <span class="ui">Text style</span> und <span class="ui">Bold</span> (oder <span class="ui">Font</span>): wie gross die Zahl steht, siehe [Stile](#stile).
- <span class="ui">Topic</span>: der gemessene Wert.
- <span class="ui">Direction</span>: in welche Richtung sich der Balken füllt.
- <span class="ui">Size</span>: wie dick der Balken ist, in vier Stufen, <span class="ui">XS</span>, <span class="ui">S</span>, <span class="ui">M</span> und <span class="ui">L</span> (1.15, 1.7, 2.9 und 4.6 mm, auf dem 4.3B 10, 15, 25 und 40 Pixel). Bar, Slider, Gauge und Dial haben dieselben Stufen, ihre Balken und Ringe sind also gleich dick. Beim Slider steht der Anfasser über den Balken hinaus. Ein neuer Bar beginnt in <span class="ui">M</span>. Passt die Dicke zu keiner Stufe, etwa bei einem Balken aus der Zeit vor den Stufen, steht «Custom» mit der Dicke in Pixeln da, und «Snap to …» setzt ihn auf die nächste Stufe. Auf älteren Geräten fehlt das Feld.
- <span class="ui">Thickness</span>: wie dick der Balken ist, in Pixeln. Das Objekt kann grösser sein, der Balken steht dann in seiner Mitte. Tippst du hier eine Zahl ein, gilt keine Stufe mehr.

Hat ein Bar eine Stufe, ziehst du ihn auf dem Screen nur noch in der Länge. Dicker oder dünner wird er über <span class="ui">Size</span>.

<Screenshot narrow name="feld-size" alt="Unter Shape die Felder Size, Direction, Thickness und Setpoint topic eines Sliders" />
- <span class="ui">Setpoint topic</span>: ein Sollwert, den die Anlage meldet. Ein kleines Dreieck unter dem Balken zeigt auf ihn, bei einem senkrechten Balken steht es rechts daneben. Einen Anfasser wie der Slider hat der Bar nicht: Verschieben lässt er sich nicht.
- <span class="ui">Calibration</span>: welcher Wert welchem Füllstand entspricht, siehe [Kalibrierung](/objekte/gemeinsames#kalibrierung). Ohne eigene Punkte ist 0 leer und 100 voll.
- <span class="ui">Colour</span>: <span class="ui">Fill</span> ist die Farbe des gefüllten Teils, <span class="ui">Track</span> die des leeren, <span class="ui">Track edge</span> ein Rand darum. Track und Rand kommen aus dem [Theme](/designer/themes#rollen), bis du sie änderst. Mit der Rolle <span class="ui">Accent</span> läuft die Füllung in einem Verlauf, siehe [Verlauf](/designer/themes#verlauf).

Ohne Wert zeigt der Bar nur den leeren Balken.

## Gauge {#gauge}

Wie Bar, aber als Ring: ein Füllstand auf einem Kreisbogen, der Wert in der Mitte. Immer quadratisch.

- <span class="ui">Show value</span>, <span class="ui">Text style</span>, <span class="ui">Topic</span>, <span class="ui">Setpoint topic</span>, <span class="ui">Calibration</span> und <span class="ui">Fill</span> wie beim Bar. Das Dreieck für den Sollwert steht aussen am Ring und zeigt zur Mitte.
- <span class="ui">Angles</span>: wo der Bogen beginnt und endet, in Grad, 0 ist oben. Voreingestellt ist ein Dreiviertelkreis. Die Enden lassen sich auch auf dem Screen an ihren Anfassern ziehen.
- <span class="ui">Direction</span>: im oder gegen den Uhrzeigersinn.
- <span class="ui">Size</span>: wie dick der Ring ist, dieselben Stufen wie beim Bar. Den Durchmesser ziehst du auf dem Screen, in Pixeln steht er unter <span class="ui">Frame</span> als <span class="ui">Diameter</span>. Hat der Ring eine Stufe, springt der Durchmesser beim Ziehen um zwei Ringdicken. Zwei Ringe mit derselben Stufe lassen sich so genau ineinander setzen. In einer Tabelle gibt die Tabelle den Platz vor, den Durchmesser bestimmst du trotzdem selbst unter <span class="ui">Diameter</span>, höchstens so breit wie die Zelle.
- <span class="ui">Thickness</span>: wie breit der Ring ist, höchstens die Hälfte des Objekts.

Ohne Wert zeigt der Gauge nur den leeren Ring.
