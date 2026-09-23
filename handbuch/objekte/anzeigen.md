# Anzeigen

Objekte, die etwas zeigen und nichts schalten.

## Text {#text}

Fester Text, den du selbst schreibst, etwa eine Überschrift oder eine Beschriftung.

- <span class="ui">Text</span>: der Text. Mit <span class="ui">Insert</span> fügst du Platzhalter an, die beim Übertragen ersetzt werden: `{screen}` für den Namen des Screens, `{project}` für den Namen des Projekts, `{screen_width}` und `{screen_height}` für die Grösse, `{export_date}`, `{export_time}` und `{export_datetime}` für den Zeitpunkt der Übertragung.
- <span class="ui">Font</span> und <span class="ui">Align</span>: Schrift und Ausrichtung.
- <span class="ui">Colour</span>: Textfarbe, Hintergrund und Rahmen. Hintergrund und Rahmen können durchsichtig sein.

Die Höhe richtet sich nach der Schrift. Für einen grösseren Text wählst du eine grössere Schrift.

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

- <span class="ui">Name</span> und <span class="ui">Icon</span> stehen über dem Balken, links.
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
