# Anzeigen

Objekte, die etwas zeigen und nichts schalten.

## Text {#text}

Text, den du selbst schreibst, etwa eine Überschrift oder eine Beschriftung. Er kann Werte aus dem Van enthalten, siehe [Platzhalter](#platzhalter).

- <span class="ui">Text</span>: der Text.
- <span class="ui">Text style</span> und <span class="ui">Bold</span>, oder auf älteren Geräten <span class="ui">Font</span>: wie gross und in welcher Schrift, siehe [Stile](#stile).
- <span class="ui">Align</span>: die Ausrichtung.
- <span class="ui">Colour</span>: Textfarbe, Hintergrund und Rahmen. Hintergrund und Rahmen können durchsichtig sein.

Die Höhe richtet sich nach der Schrift. Für einen grösseren Text wählst du einen grösseren Stil.

### Stile {#stile}

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

Das Display von «Technic» sieht aus wie eine alte Digitalanzeige. Ziffern stehen darin sauber, Buchstaben nur so weit, wie sieben Striche sie hergeben: ein «M» oder «W» ist kaum zu lesen. Nimm Display in «Technic» deshalb für Zahlen. Welche Typografie ein Projekt nimmt, stellst du unter <span class="ui">Typography</span> ein, siehe [Projekteinstellungen](/designer/projekte#projekteinstellungen).

Neue Objekte beginnen im Stil <span class="ui">Label</span>. Nur der Wert in der Mitte von Gauge und Dial beginnt in <span class="ui">Display</span>, weil er dort allein steht.

Ein Text aus der Zeit vor den Stilen zeigt unter <span class="ui">Text style</span> «Custom» und die Schrift, in der er steht. Er bleibt so, bis du einen Stil wählst. Der Knopf «Snap to …» setzt ihn auf den Stil, der seiner Grösse am nächsten kommt.

Geräte, die ihre Grösse in Millimetern noch nicht angeben, zeigen stattdessen wie bisher <span class="ui">Font</span> mit den Schriften des Geräts.

### Platzhalter {#platzhalter}

Ein Platzhalter steht in geschweiften Klammern, und das Gerät setzt dort einen Wert ein. Aus `Frischwasser {topic:schaltli/state/tank/1/level:F0} %` wird auf dem Display «Frischwasser 72 %», und die Zahl folgt dem Tank. Platzhalter gehen nur im Text.

| Platzhalter | zeigt |
|---|---|
| `{topic:…}` | den letzten Wert des Topics. Bei einem JSON-Topic wählst du mit `#` ein Feld, etwa `{topic:van/klima#temp}`. |
| `{device:model}` | das Modell des Geräts, etwa «Waveshare Knob-Touch LCD 1.8» |
| `{device:id}` | die Kennung des Geräts, etwa «gleaming-harvest» |
| `{project:name}` | den Namen des Projekts. Er wird beim Übertragen fest eingesetzt. |

**Auswählen statt tippen:** Sobald du `{` tippst, klappt eine Liste auf. Sie zeigt die Topics des Projekts, jeweils mit Typ und erstem Beispielwert, und darunter die Felder von Gerät und Projekt. Was du weitertippst, filtert die Liste. Gesucht wird im Pfad und im Beispielwert, `frisch` findet also auch das Topic mit dem Beispiel «Frischwasser». Mit den Pfeiltasten wählst du aus, <kbd>Enter</kbd> oder <kbd>Tab</kbd> setzt den Platzhalter samt schliessender Klammer ein. Der Cursor steht danach vor dem `}`. Tippst du dort `:`, bietet die Liste die gängigen Formate an, mit einer Vorschau am Beispielwert: `F1` wird etwa zu 72.0. <kbd>Esc</kbd> schliesst die Liste. Hast du einen Platzhalter von Hand geändert, holt <kbd>Ctrl</kbd>+<kbd>Space</kbd> sie zurück, solange der Cursor zwischen den Klammern steht.

**Zahlen formatieren:** Ein Zusatz hinter dem Topic bestimmt, wie eine Zahl erscheint. `:F2` gibt zwei Nachkommastellen, `:N0` eine ganze Zahl mit Tausendertrennzeichen. Möglich sind `F0` bis `F9` und `N0` bis `N9`. Gerundet wird kaufmännisch, 72.5 wird bei `:F0` also zu 73. Welches Zeichen vor den Nachkommastellen steht und welches die Tausender trennt, stellst du unter <span class="ui">Settings</span> › <span class="ui">Project Properties</span> › <span class="ui">Number format</span> ein, siehe [Projekteinstellungen](/designer/projekte#projekteinstellungen). Ohne Zusatz zeigt das Gerät den Wert genau so, wie er ankommt.

**Bevor ein Wert da ist:** Nach dem Einschalten dauert es einen Moment, bis die Werte ankommen. Mit `??` gibst du an, was solange dasteht: `{topic:…/name ?? "Frischwasser"}` oder `{topic:… ?? 0:F1}`. Ohne `??` bleibt die Stelle leer.

::: v-pre
**Klammern als Zeichen** schreibst du doppelt, `{{` und `}}`.
:::

Einen Platzhalter, den der Designer nicht versteht, etwa wegen eines Tippfehlers, zeigt das Gerät genau so, wie du ihn geschrieben hast. Das siehst du schon im Designer: Unter dem Feld steht dann eine rote Zeile, die den Grund nennt. Eine gelbe Zeile bedeutet, dass ein Topic im Projekt noch fehlt. Der Designer trägt es ein, sobald du das Feld verlässt, und die Zeile verschwindet. Ist alles in Ordnung, steht dort ein kurzer Hinweis zu `{` und `??`.

::: warning Ältere Geräte
Platzhalter ersetzt ein Gerät erst mit einer Firmware oder App, die sie kennt. Ein älteres zeigt den Text so, wie er geschrieben ist. Der Designer warnt davor, wenn du auf ein solches Gerät überträgst.
:::

## Live Text {#live-text}

Zeigt den Wert eines Topics als Text, etwa eine Temperatur oder einen Strom.

- <span class="ui">Topic</span> unter <span class="ui">Data</span>: woher der Wert kommt. Bei einem JSON-Topic wählst du das Feld dazu.
- <span class="ui">Show as</span>:
  - <span class="ui">As it arrives</span> zeigt den Wert, wie er ankommt, Text oder Zahl.
  - <span class="ui">Formatted number</span> formatiert eine Zahl. Dazu gehören <span class="ui">Prefix / suffix</span> vor und nach der Zahl, etwa «°C» oder «%», <span class="ui">Decimals</span> für die Nachkommastellen und <span class="ui">Thousands</span> für das Tausender-Trennzeichen, etwa «'».
- <span class="ui">Text style</span> und <span class="ui">Bold</span> (oder <span class="ui">Font</span>), <span class="ui">Align</span> und <span class="ui">Colour</span> wie beim Text.

Kommt bei <span class="ui">Formatted number</span> etwas an, das keine Zahl ist, zeigt Live Text es unverändert, ohne Präfix und Suffix. Solange noch kein Wert da ist, zeigt Live Text gar nichts, auch kein Präfix.

## Icon {#icon}

Ein Bild aus der Icon-Sammlung des Projekts, immer quadratisch.

- <span class="ui">Icon</span>: welches. Die Icons selbst verwaltest du unter <span class="ui">Settings</span> › <span class="ui">Assets</span>, siehe [Icons und Schriften](/designer/icons-schriften).
- <span class="ui">Colour</span>: die Farbe des Icons und der Hintergrund, der anfangs durchsichtig ist.

Die Grösse stellst du unter <span class="ui">Frame</span> als <span class="ui">Size</span> ein, die Höhe folgt.

## Live Icon {#live-icon}

Zeigt eines von mehreren Icons, je nach Wert eines Topics: eine leere oder volle Batterie, eine Lampe an oder aus.

- <span class="ui">Topic</span>: woher der Wert kommt.
- <span class="ui">Rules</span>: eine Liste von Regeln der Form <span class="ui">If value</span> … <span class="ui">Then</span> …, zum Beispiel «wenn Wert > 80, dann Icon Batterie voll». Die Regeln werden von oben gelesen, die erste passende bestimmt das Icon. Passt keine, zeigt Live Icon nichts. <span class="ui">Add rule</span> fügt eine Regel hinzu. Wie Vergleiche funktionieren, steht unter [Bedingungen](/objekte/gemeinsames#bedingungen).
- <span class="ui">Colour</span>: eine Farbe für alle Icons, und der Hintergrund.

## Bar {#bar}

Ein Balken, der einen Füllstand zeigt: Tank, Batterie, Auslastung. Ablesen, nicht einstellen; dafür gibt es den [Slider](/objekte/bedienen#slider). Der Baustein <span class="ui">Tank</span> setzt einen Bar und darüber einen [Text](#text) mit dem Namen des Tanks.

Einen eigenen Namen oder ein Icon hat der Bar nicht. Soll dabeistehen, was er anzeigt, setzt du einen Text oder ein [Icon](#icon) neben den Balken. Fasst du beides zu einer [Gruppe](/objekte/anordnen#gruppe) zusammen, bleibt es beim Verschieben beisammen. Der Text kann [Platzhalter](#platzhalter) enthalten, etwa den Namen, den dein Van dem Tank gibt.

- <span class="ui">Show value</span>: am Ende des Balkens nichts (<span class="ui">None</span>), den Wert (<span class="ui">Value</span>) oder den Füllstand in Prozent (<span class="ui">Percentage</span>). Bei einem waagrechten Balken steht die Zahl rechts, bei einem senkrechten darunter.
- <span class="ui">Text style</span> und <span class="ui">Bold</span> (oder <span class="ui">Font</span>): wie gross die Zahl steht, siehe [Stile](#stile).
- <span class="ui">Topic</span>: der gemessene Wert.
- <span class="ui">Direction</span>: in welche Richtung sich der Balken füllt.
- <span class="ui">Thickness</span>: wie dick der Balken ist. Das Objekt kann grösser sein, der Balken steht dann in seiner Mitte.
- <span class="ui">Setpoint topic</span>: ein Sollwert, den die Anlage meldet. Ein kleines Dreieck unter dem Balken zeigt auf ihn, bei einem senkrechten Balken steht es rechts daneben. Einen Anfasser wie der Slider hat der Bar nicht: Verschieben lässt er sich nicht.
- <span class="ui">Calibration</span>: welcher Wert welchem Füllstand entspricht, siehe [Kalibrierung](/objekte/gemeinsames#kalibrierung). Ohne eigene Punkte ist 0 leer und 100 voll.
- <span class="ui">Colour</span>: <span class="ui">Fill</span> ist die Farbe des gefüllten Teils. Den leeren Teil rechnet der Designer daraus und aus dem Hintergrund aus. Mit der Rolle <span class="ui">Accent</span> läuft die Füllung in einem Verlauf, siehe [Verlauf](/designer/themes#verlauf).

Ohne Wert zeigt der Bar nur den leeren Balken.

## Gauge {#gauge}

Wie Bar, aber als Ring: ein Füllstand auf einem Kreisbogen, der Wert in der Mitte. Immer quadratisch.

- <span class="ui">Show value</span>, <span class="ui">Text style</span>, <span class="ui">Topic</span>, <span class="ui">Setpoint topic</span>, <span class="ui">Calibration</span> und <span class="ui">Fill</span> wie beim Bar. Das Dreieck für den Sollwert steht aussen am Ring und zeigt zur Mitte.
- <span class="ui">Angles</span>: wo der Bogen beginnt und endet, in Grad, 0 ist oben. Voreingestellt ist ein Dreiviertelkreis. Die Enden lassen sich auch auf dem Screen an ihren Anfassern ziehen.
- <span class="ui">Direction</span>: im oder gegen den Uhrzeigersinn.
- <span class="ui">Thickness</span>: wie breit der Ring ist, höchstens die Hälfte des Objekts.

Ohne Wert zeigt der Gauge nur den leeren Ring.
