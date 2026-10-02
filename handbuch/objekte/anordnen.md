# Anordnen

## Container {#container}

Ein Container ordnet, was du hineinlegst. Du schiebst nichts mehr auf den Pixel genau: Der Container sagt, wo ein Objekt steht und wie breit es ist, und richtet sich neu ein, wenn sich etwas ändert, etwa die Grösse eines Schalters von M auf L oder das Gerät. In der Werkzeugleiste stehen unter <span class="ui">Layout</span> vier Container und der [Spacer](#spacer):

| Werkzeug | ordnet |
|---|---|
| <span class="ui">Stack</span> | untereinander |
| <span class="ui">Row</span> | nebeneinander |
| <span class="ui">Grid</span> | in Spalten, Zeile um Zeile. So stehen Namen und Bedienelemente bündig untereinander. |
| <span class="ui">Free</span> | gar nicht: was drin liegt, bleibt, wo du es hinsetzt, wie auf einem Screen |

Einen Container ziehst du auf dem Screen auf wie eine Box. Auch der Screen selbst ordnet wie ein Container, wenn du ihm ein [Layout](/designer/screens#layout) gibst. Ein neuer Screen hat schon eines.

Solange du mit einem Container arbeitest, zeigt er seinen Rand türkis gestrichelt und färbt die Plätze leicht ein, die er seinen Objekten gibt: wenn er ausgewählt oder offen ist, wenn ein Objekt darin ausgewählt ist und wenn die blaue Linie in ihn zeigt. Ein Screen mit Layout zeigt sich genauso. Sonst sieht man nichts davon.

**Etwas hineinlegen.** Wähl ein Werkzeug, etwa <span class="ui">Text</span>, und fahr über einen Stack, eine Row oder ein Grid. Eine blaue Linie zeigt, wo das neue Objekt hinkommt: zwischen zwei Objekte im Stack, vor ein Objekt in der Row, an eine Stelle im Grid, Zeile um Zeile gelesen. Ein Klick legt es dort hin. Ein Rechteck ziehst du dafür nicht auf, Platz und Breite gibt der Container. In einem Free und auf dem Screen daneben ziehst du wie gewohnt ein Rechteck auf.

<Screenshot name="layout-linie" alt="Ein Screen mit zwei Bausteinen, die Plätze des Grid leicht eingefärbt, am Ende der letzten Zeile die blaue Linie" caption="Vor dem Klick: Die blaue Linie zeigt, wo der nächste Baustein hinkommt." />

**Verschieben.** Was in einem Container liegt, erreichst du mit einem Doppelklick in den Container, wie bei einer [Gruppe](#gruppe), oder in der Objektliste. Die zeigt den Inhalt eines Stack, einer Row oder eines Grid in der Reihenfolge, in der er auf dem Screen steht. Bei einer Gruppe im Grid gilt das auch für ihre Teile: Oben steht, was das Grid in die erste Spalte setzt, bei einem Baustein der Name. Ziehst du ein Objekt, zeigt wieder die blaue Linie, wo es landet: an einer anderen Stelle im selben Container oder in einem anderen. Erst beim Loslassen zieht es um, solange bleibt es stehen. In der Objektliste ziehst du eine Zeile auf die Mitte eines Containers, um das Objekt hineinzulegen. Hast du mehrere Objekte ausgewählt, ziehen sie zusammen um und behalten ihre Reihenfolge.

**Wie breit und wie hoch.** Die Höhe eines Objekts ist seine eigene: bei einem Schalter, einer Knopfgruppe oder einem Knopf die Grösse S, M oder L (unter <span class="ui">Size</span>, siehe [Switch](/objekte/bedienen#switch)), bei einem Text seine Schrift. Breit ist es so, wie es braucht. Ein Text ist so breit wie seine Wörter, ein Schalter so breit wie seine Beschriftung. Schmaler wird ein Schalter, eine Knopfgruppe oder ein Knopf nie: Ist der Platz zu knapp, ragt er hinaus, und der Container zeigt einen Hinweis. Ganz durch geht nur, was keine eigene Breite hat: ein Balken oder Slider, ein Switcher, ein Container in einem Container. Ein Gauge oder Dial behält seinen Durchmesser, höchstens so gross, wie Platz ist.

**Was du einstellst.** Wählst du einen Container, stehen unter <span class="ui">Layout</span>:

- <span class="ui">Padding</span>: Abstand zwischen Rand und Inhalt, in Millimetern, damit er auf jedem Gerät gleich aussieht. Ein Container hat von sich aus keinen. So steht der Inhalt eines Grid in einem Stack bündig mit dem Rest.
- <span class="ui">Gap</span>: Abstand zwischen den Objekten, ebenfalls in Millimetern.
- beim Stack <span class="ui">Align</span>: wo ein Objekt steht, das schmaler ist als der Stack: <span class="ui">Start</span>, <span class="ui">Centre</span> oder <span class="ui">End</span>. Mit <span class="ui">Stretch</span> wird jedes so breit wie der Stack.
- bei der Row <span class="ui">Align</span> (<span class="ui">Top</span>, <span class="ui">Centre</span>, <span class="ui">Bottom</span>) und <span class="ui">Distribute</span>: wie sich die Objekte die Länge teilen, mit <span class="ui">Space between</span> gleichmässig verteilt, mit <span class="ui">Fill</span> alle gleich breit.
- beim Grid <span class="ui">Columns</span>: ein Eintrag pro Spalte, durch Kommas getrennt. `auto` ist so breit wie das breiteste Objekt darin, eine Zahl ein Anteil am Rest. Für Namen und Bedienelemente nimmst du `auto, 1`. In einer Zeile steht jedes Objekt in der Mitte, ein Name also auf Höhe seines Schalters.

Ein Objekt in einem Stack, einer Row oder einem Grid zeigt seine Position und Breite unter <span class="ui">Frame</span> nur an. Verschieben kannst du es dort nicht, das macht der Container. Die Grösse S, M oder L stellst du weiter beim Objekt ein.

Passt nicht alles hinein, zeichnet der Designer es trotzdem, und das Gerät schneidet es am Rand des Screens ab. In den Eigenschaften des Containers steht dann ein Hinweis. Verkleinert wird nichts. Auf dem runden [Knob](/geraete/knob) ist das schnell der Fall, denn sein [Inhaltsbereich](/designer/screens#inhaltsbereich) misst nur 32 mm im Quadrat.

Container kennt nur der Designer. Das Gerät bekommt die Objekte an den Stellen, die der Container ausgerechnet hat.

### Spacer {#spacer}

Ein <span class="ui">Spacer</span> aus der Gruppe <span class="ui">Layout</span> ist ein leerer Platz. Im Grid lässt er eine Zelle frei, etwa die Namensspalte neben einem zweiten Bedienelement. Im Stack ist er ein Abstand, so hoch wie er ist, in der Row so breit. Die Höhe stellst du unter <span class="ui">Frame</span> ein. Zu sehen ist er nur, solange sein Container aktiv ist, und das Gerät bekommt nichts davon.

## Switcher {#switcher}

Ein Bereich, der je nach Wert eines Topics einen anderen Inhalt zeigt. Beispiel: Je nachdem, ob die Heizung im Modus «Heizen» oder «Lüften» läuft, zeigt derselbe Bereich andere Anzeigen und Regler.

Ein Switcher besteht aus Panels. Jedes Panel ist eine eigene kleine Fläche mit eigenen Objekten, und jedes hat eine Bedingung. Gezeigt wird das erste Panel, dessen Bedingung passt.

- <span class="ui">Topic</span> unter <span class="ui">Data</span>: der Wert, gegen den alle Panels prüfen.
- <span class="ui">Panels</span>: die Liste der Panels, von oben gelesen. Jedes hat <span class="ui">Shown when</span> mit einer [Bedingung](/objekte/gemeinsames#bedingungen), etwa `== heizen`, und <span class="ui">Open for editing</span>. <span class="ui">Add panel</span> fügt eines hinzu.

Alle Panels füllen den Switcher genau aus. Verschieben und Grösse ändern kannst du nur den Switcher selbst.

**Bearbeiten:** Ist der Switcher ausgewählt, erscheinen über ihm Reiter, einer pro Panel. Ein Klick auf einen Reiter öffnet dieses Panel. Neue Objekte landen dann darin. <span class="ui">+</span> bei den Reitern fügt ein Panel hinzu. In der Objektliste kannst du Objekte auch in ein Panel ziehen.

Ohne Wert zeigt der Switcher das erste Panel.

Die Reiter gibt es nur im Designer. Auf dem Gerät sieht man immer nur das gerade gültige Panel.

## Panel {#panel}

Panels legst du nicht mit einem Werkzeug an, sondern im Switcher. Ausgewählt zeigen sie nur ihre Bedingung unter <span class="ui">Shown when</span>. Position und Grösse übernehmen sie vom Switcher.

## Gruppe {#gruppe}

Eine Gruppe hält Objekte zusammen, etwa einen Text und den Slider darunter oder einen Text und den Schalter daneben. Die Objekte bleiben, was sie sind; sie werden nur gemeinsam verschoben. [Bausteine](/designer/bausteine) kommen schon als Gruppe auf den Screen.

Zum Gruppieren wählst du die Objekte aus, mit <kbd>Strg</kbd>-Klick oder mit einem Rahmen, den du um sie ziehst, und drückst <kbd>Strg</kbd>+<kbd>G</kbd>. Dasselbe steht als <span class="ui">Group</span> im Menü der rechten Maustaste und unter <span class="ui">Arrange</span> in den Eigenschaften mehrerer Objekte. Die Objekte müssen am selben Ort liegen: alle direkt auf dem Screen, alle im selben Panel oder alle in derselben Gruppe. Switcher und Panels kommen in keine Gruppe.

Aufgelöst wird eine Gruppe mit <kbd>Strg</kbd>+<kbd>U</kbd> oder <kbd>Strg</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>, mit <span class="ui">Ungroup</span> im Menü der rechten Maustaste oder in ihren Eigenschaften. Die Objekte bleiben, wo sie sind, und sind danach ausgewählt.

Ein Klick auf eines ihrer Objekte wählt die ganze Gruppe; Ziehen und die Pfeiltasten verschieben sie als Ganzes. Anfasser zum Vergrössern hat sie keine, denn ihre Grösse ergibt sich aus den Objekten darin. Mit einem Doppelklick gehst du hinein: Der übrige Screen wird blass, ein violetter Rahmen zeigt die Gruppe, und ein Klick wählt jetzt ein einzelnes Objekt. Ein Rahmen, den du hier ziehst, fängt nur Objekte der Gruppe. Neue Objekte landen dann in der Gruppe. <kbd>Esc</kbd> oder ein Klick neben die Gruppe führt wieder hinaus.

In der Objektliste unter <span class="ui">Objects</span> stehen die Objekte eingerückt unter ihrer Gruppe. Wählst du eines davon aus, bist du in der Gruppe wie nach einem Doppelklick. Ziehst du ein Objekt auf die Mitte der Zeile einer Gruppe, kommt es hinein; ziehst du es anderswohin, verlässt es sie. Das Schloss an der Gruppe sperrt sie als Ganzes.

Kopieren und Einfügen nimmt die Gruppe mit allem darin mit. Verlässt das letzte Objekt eine Gruppe, verschwindet sie.

Gruppen gibt es nur im Designer. Beim Übertragen löst der Designer sie auf, und das Gerät bekommt die einzelnen Objekte an derselben Stelle und in derselben Reihenfolge.
