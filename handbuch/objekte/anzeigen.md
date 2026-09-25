# Anzeigen

Objekte, die etwas zeigen und nichts schalten.

## Text {#text}

Text, den du selbst schreibst, etwa eine Überschrift oder eine Beschriftung. Er kann Werte aus dem Van enthalten, siehe [Platzhalter](#platzhalter).

- <span class="ui">Text</span>: der Text.
- <span class="ui">Font</span> und <span class="ui">Align</span>: Schrift und Ausrichtung.
- <span class="ui">Colour</span>: Textfarbe, Hintergrund und Rahmen. Hintergrund und Rahmen können durchsichtig sein.

Die Höhe richtet sich nach der Schrift. Für einen grösseren Text wählst du eine grössere Schrift.

### Platzhalter {#platzhalter}

Ein Platzhalter steht in geschweiften Klammern, und das Gerät setzt dort einen Wert ein. Aus `Frischwasser {topic:schaltli/state/tank/1/level:F0} %` wird auf dem Display «Frischwasser 72 %», und die Zahl folgt dem Tank. Platzhalter gehen im Text und im <span class="ui">Name</span> von [Bar](#bar) und [Slider](/objekte/bedienen#slider).

| Platzhalter | zeigt |
|---|---|
| `{topic:…}` | den letzten Wert des Topics. Bei einem JSON-Topic wählst du mit `#` ein Feld, etwa `{topic:van/klima#temp}`. |
| `{device:model}` | das Modell des Geräts, etwa «Waveshare Knob-Touch LCD 1.8» |
| `{device:id}` | die Kennung des Geräts, etwa «gleaming-harvest» |
| `{project:name}` | den Namen des Projekts. Er wird beim Übertragen fest eingesetzt. |

**Zahlen formatieren:** Ein Zusatz hinter dem Topic bestimmt, wie eine Zahl erscheint. `:F2` gibt zwei Nachkommastellen, `:N0` eine ganze Zahl mit Tausendertrennzeichen. Möglich sind `F0` bis `F9` und `N0` bis `N9`. Gerundet wird kaufmännisch, 72.5 wird bei `:F0` also zu 73. Welches Zeichen vor den Nachkommastellen steht und welches die Tausender trennt, stellst du unter <span class="ui">Settings</span> › <span class="ui">Project Properties</span> › <span class="ui">Number format</span> ein, siehe [Projekteinstellungen](/designer/projekte#projekteinstellungen). Ohne Zusatz zeigt das Gerät den Wert genau so, wie er ankommt.

**Bevor ein Wert da ist:** Nach dem Einschalten dauert es einen Moment, bis die Werte ankommen. Mit `??` gibst du an, was solange dasteht: `{topic:…/name ?? "Frischwasser"}` oder `{topic:… ?? 0:F1}`. Ohne `??` bleibt die Stelle leer.

::: v-pre
**Klammern als Zeichen** schreibst du doppelt, `{{` und `}}`.
:::

Einen Platzhalter, den der Designer nicht versteht, etwa wegen eines Tippfehlers, zeigt das Gerät genau so, wie du ihn geschrieben hast. So fällt der Fehler auf. Ein Topic, das im Projekt noch fehlt, trägt der Designer ein, sobald du das Textfeld verlässt.

::: warning Ältere Geräte
Platzhalter ersetzt ein Gerät erst mit einer Firmware oder App, die sie kennt. Ein älteres zeigt den Text so, wie er geschrieben ist. Der Designer warnt davor, wenn du auf ein solches Gerät überträgst.
:::

## Live Text {#live-text}

Zeigt den Wert eines Topics als Text, etwa eine Temperatur oder einen Strom.

- <span class="ui">Topic</span> unter <span class="ui">Data</span>: woher der Wert kommt. Bei einem JSON-Topic wählst du das Feld dazu.
- <span class="ui">Show as</span>:
  - <span class="ui">As it arrives</span> zeigt den Wert, wie er ankommt, Text oder Zahl.
  - <span class="ui">Formatted number</span> formatiert eine Zahl. Dazu gehören <span class="ui">Prefix / suffix</span> vor und nach der Zahl, etwa «°C» oder «%», <span class="ui">Decimals</span> für die Nachkommastellen und <span class="ui">Thousands</span> für das Tausender-Trennzeichen, etwa «'».
- <span class="ui">Font</span>, <span class="ui">Align</span> und <span class="ui">Colour</span> wie beim Text.

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

Ein Balken, der einen Füllstand zeigt: Tank, Batterie, Auslastung. Ablesen, nicht einstellen; dafür gibt es den [Slider](/objekte/bedienen#slider). Der Baustein <span class="ui">Tank</span> setzt einen Bar.

- <span class="ui">Name</span> und <span class="ui">Icon</span> stehen über dem Balken, links. Der Name kann [Platzhalter](#platzhalter) enthalten, etwa den Namen, den dein Van dem Tank gibt.
- <span class="ui">Show value</span>: rechts über dem Balken nichts (<span class="ui">None</span>), den Wert (<span class="ui">Value</span>) oder den Füllstand in Prozent (<span class="ui">Percentage</span>).
- <span class="ui">Topic</span>: der gemessene Wert.
- <span class="ui">Direction</span>: in welche Richtung sich der Balken füllt.
- <span class="ui">Thickness</span>: wie dick der Balken ist. Das Objekt kann grösser sein; der Rest ist Platz für Name und Wert.
- <span class="ui">Setpoint topic</span>: ein Sollwert, den die Anlage meldet. Er erscheint als Markierung auf dem Balken.
- <span class="ui">Calibration</span>: welcher Wert welchem Füllstand entspricht, siehe [Kalibrierung](/objekte/gemeinsames#kalibrierung). Ohne eigene Punkte ist 0 leer und 100 voll.
- <span class="ui">Colour</span>: <span class="ui">Fill</span> ist die Farbe des gefüllten Teils. Den leeren Teil rechnet der Designer daraus und aus dem Hintergrund aus.

Ohne Wert zeigt der Bar nur den leeren Balken mit Name und Icon.

## Gauge {#gauge}

Wie Bar, aber als Ring: ein Füllstand auf einem Kreisbogen, der Wert in der Mitte. Immer quadratisch.

- <span class="ui">Show value</span>, <span class="ui">Topic</span>, <span class="ui">Setpoint topic</span>, <span class="ui">Calibration</span> und <span class="ui">Fill</span> wie beim Bar.
- <span class="ui">Angles</span>: wo der Bogen beginnt und endet, in Grad, 0 ist oben. Voreingestellt ist ein Dreiviertelkreis. Die Enden lassen sich auch auf dem Screen an ihren Anfassern ziehen.
- <span class="ui">Direction</span>: im oder gegen den Uhrzeigersinn.
- <span class="ui">Thickness</span>: wie breit der Ring ist, höchstens die Hälfte des Objekts.

Ohne Wert zeigt der Gauge nur den leeren Ring.
