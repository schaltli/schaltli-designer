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
