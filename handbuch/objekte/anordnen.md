# Anordnen

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

Ein Klick auf eines ihrer Objekte wählt die ganze Gruppe; Ziehen und die Pfeiltasten verschieben sie als Ganzes. Anfasser zum Vergrössern hat sie keine, denn ihre Grösse ergibt sich aus den Objekten darin. Mit einem Doppelklick gehst du hinein: Der übrige Screen wird blass, ein violetter Rahmen zeigt die Gruppe, und ein Klick wählt jetzt ein einzelnes Objekt. Neue Objekte landen dann in der Gruppe. <kbd>Esc</kbd> oder ein Klick neben die Gruppe führt wieder hinaus.

In der Objektliste unter <span class="ui">Objects</span> stehen die Objekte eingerückt unter ihrer Gruppe. Wählst du eines davon aus, bist du in der Gruppe wie nach einem Doppelklick. Ziehst du ein Objekt auf die Mitte der Zeile einer Gruppe, kommt es hinein; ziehst du es anderswohin, verlässt es sie. Das Schloss an der Gruppe sperrt sie als Ganzes.

Kopieren und Einfügen nimmt die Gruppe mit allem darin mit. Verlässt das letzte Objekt eine Gruppe, verschwindet sie.

Gruppen gibt es nur im Designer. Beim Übertragen löst der Designer sie auf, und das Gerät bekommt die einzelnen Objekte an derselben Stelle und in derselben Reihenfolge.
