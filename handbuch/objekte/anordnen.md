# Anordnen

## Container {#container}

Eine Tabelle ordnet, was du hineinlegst, in Zeilen und Spalten, wie eine Tabelle in Word. Jedes Objekt steht in seiner Zelle, so stehen Namen und Bedienelemente bündig untereinander. Du schiebst nichts auf den Pixel genau: Die Tabelle sagt, wo ein Objekt steht und wie breit es ist, und richtet sich neu ein, wenn sich etwas ändert, etwa die Grösse eines Schalters von M auf L oder das Gerät.

In der Werkzeugleiste steht dafür unter <span class="ui">Tables</span> das Werkzeug <span class="ui">Table</span>. Ein Klick darauf öffnet das Menü <span class="ui">Table template</span>, die Vorlagen, jede mit einem kleinen Bild:

| Vorlage | Spalten |
|---|---|
| <span class="ui">One column</span> | eine, alles untereinander |
| <span class="ui">Name and control</span> | zwei: links die Namen, so breit wie der längste, rechts die Bedienelemente im Rest |
| <span class="ui">Two columns</span> | zwei gleich breite |

Hast du eine Vorlage gewählt, steht das Werkzeug bereit, und oben auf der Zeichenfläche sagt ein Hinweis, was zu tun ist. Ein Klick auf den Screen setzt die Tabelle hin, ab dem Klickpunkt bis zum rechten Rand. Ziehst du stattdessen ein Rechteck auf, bestimmst du die Breite selbst. <kbd>Esc</kbd> legt das Werkzeug wieder weg. Die Tabelle beginnt mit einer Zeile. Ein [Baustein](/designer/bausteine) auf dem Screen bringt seine eigene Tabelle mit.

Ältere Projekte können noch einen <span class="ui">Free</span> enthalten, eine freie Fläche, in der jedes Objekt bleibt, wo du es hinsetzt. Er funktioniert weiter, neu anlegen lässt er sich nicht mehr: Ein Screen ist ohnehin frei.

**Die Linien.** Eine Tabelle zeigt im Designer immer ihre Linien, dünn, grau und gestrichelt, auch um leere Zellen. Eine Tabelle endet mit ihrer letzten Zeile. Die Tabelle, mit der du gerade arbeitest, zeigt ihre Linien kräftig in Türkis: wenn sie ausgewählt ist oder ein Objekt darin. In der Vorschau und auf dem Gerät sind keine Linien zu sehen.

**In eine Tabelle setzen.** Wähl ein Werkzeug, etwa <span class="ui">Text</span>, und fahr über eine Tabelle. Über einer leeren Zelle leuchtet die Zelle auf, ein Klick setzt das Objekt hinein. Über einer Linie zwischen zwei Zeilen erscheint eine dicke Linie, ein Klick schiebt dort eine neue Zeile ein, und alles darunter rückt eine Zeile nach unten. Solange ein Werkzeug oder ein Baustein bereitsteht, zeigt jede leere Zelle ein <span class="ui">+</span>, und unter jeder Tabelle steht eines. Fährst du über das <span class="ui">+</span> unter der Tabelle, wird ihre untere Linie dick, und ein Klick hängt das Objekt in einer neuen Zeile an. Bei einer Tabelle, die in einer anderen steht, erscheint dieses <span class="ui">+</span> erst, wenn du über sie fährst, sonst läge es mitten in der nächsten Zeile. Unter der letzten Zeile nimmt eine Tabelle nichts. Eine belegte Zelle nimmt ebenfalls nichts. Ein Rechteck ziehst du in einer Tabelle nicht auf, Platz und Breite gibt die Tabelle. In einem Free und auf dem Screen ziehst du wie gewohnt ein Rechteck auf.

<Screenshot name="layout-linie" alt="Ein Screen mit zwei Bausteinen in einer Tabelle, darunter ein Plus, die untere Linie der Tabelle dick" caption="Über dem + unter der Tabelle wird ihre untere Linie dick: Dort kommt der nächste Baustein hin." />

**In einer Tabelle verschieben.** Ziehst du ein Objekt über eine Tabelle, leuchtet wieder die leere Zelle auf, oder die dicke Linie zwischen zwei Zeilen erscheint, oder über dem <span class="ui">+</span> darunter die dicke untere Linie. Beim Loslassen kommt es dorthin, vorher bleibt es stehen. Mehrere ausgewählte Objekte behalten dabei ihre Lage zueinander: Zwei nebeneinander stehen auch danach nebeneinander. Was in einer Tabelle liegt, erreichst du mit einem Klick, auch in einer Tabelle, die in einer Tabelle steht: Der Klick wählt, was in der Zelle unter dem Zeiger steht. Ist die Zelle leer, wählt er die Zelle selbst, und sie bekommt einen türkisen Rahmen. Die Tabelle selbst wählst du wie in Word über ihren Griff: Fährst du über eine Tabelle, erscheint schräg vor ihrer linken oberen Ecke ein kleines Quadrat mit vier Pfeilen. Ein Klick darauf wählt die Tabelle, ziehst du daran, verschiebst du sie, in eine leere Zelle, auf eine Linie zwischen zwei Zeilen oder auf das <span class="ui">+</span> unter einer Tabelle. Bei verschachtelten Tabellen hat nur die innerste unter dem Zeiger einen Griff. Wählen kannst du eine Tabelle auch über ihren Pfad im Menüband (siehe unten) oder in der Objektliste. Dort steht der Inhalt einer Tabelle Zeile für Zeile. Ziehst du einen Eintrag der Liste auf eine Tabelle, landet das Objekt in einer neuen Zeile an ihrem Ende. Ziehst du es über oder unter einen Eintrag der Tabelle, schiebt sie dort eine neue Zeile ein.

**Spalten und Zeilen.** Die Tabelle, mit der du arbeitest, zeigt oben auf jeder Linie zwischen zwei Spalten einen kleinen Griff. Ziehst du ihn, verschiebt sich die Breite zwischen den beiden Spalten, und während des Ziehens stehen ihre Anteile in Prozent da. Ein <span class="ui">+</span> unter der Tabelle fügt eine Zeile an, ein <span class="ui">+</span> rechts eine Spalte. Wie in Word steht zudem ein kleines <span class="ui">+</span> am Ende jeder Linie: links von einer Linie zwischen zwei Zeilen schiebt es dort eine Zeile ein, über einer Linie zwischen zwei Spalten eine Spalte. Bei einer Tabelle, die in einer anderen steht, erscheinen der Streifen über den Spalten und alle diese Plus erst, wenn du mit der Maus über sie fährst. Sonst lägen sie über der Zeile darüber. Der Abstand zwischen den Zellen ist fest: 1.5 mm, auf jedem Gerät.

**Die Gruppe Table im Menüband.** Sobald du in einer Tabelle arbeitest, also eine Tabelle, ein Objekt darin oder eine leere Zelle gewählt hast, erscheint am Ende des Menübands die Gruppe für Tabellen. Unten steht der Pfad dorthin, wo du bist, etwa <span class="ui">Table</span> › <span class="ui">Table</span> › Cell 2, 1. Ein Klick auf eine Stufe wählt diese Tabelle, so kommst du bei verschachtelten Tabellen mit einem Klick auf jede Ebene. Darüber stehen die Befehle für die gewählte Zelle:

| Befehl | macht |
|---|---|
| <span class="ui">Row above</span>, <span class="ui">Row below</span> | eine leere Zeile über oder unter der Zelle |
| <span class="ui">Column left</span>, <span class="ui">Column right</span> | eine leere Spalte links oder rechts davon |
| <span class="ui">Delete row</span>, <span class="ui">Delete column</span> | entfernt die Zeile oder Spalte. Was nur dort stand, rückt in die ersten freien Zellen. |
| <span class="ui">Merge right</span>, <span class="ui">Merge down</span> | verbindet die Zelle mit der leeren daneben oder darunter |
| <span class="ui">Split</span> | löst verbundene Zellen wieder |

Verbinden und lösen geht nur mit einer Zelle, in der ein Objekt steht, und nur in eine leere Zelle. Wo ein Befehl nichts tun kann, ist er grau. Ist eine Tabelle gewählt und keine Zelle, gelten die Befehle für ihre letzte Zeile und Spalte. Jeder Befehl lässt sich mit Ctrl+Z rückgängig machen.

**Rechtsklick.** Ein Rechtsklick in eine Tabelle wählt die Zelle unter dem Zeiger und zeigt oben im Menü dieselben Befehle.

**Einfügen in eine Zelle.** Kopierst oder schneidest du ein Objekt aus, wählst dann eine leere Zelle und drückst <kbd>Strg</kbd>+<kbd>V</kbd>, kommt es genau in diese Zelle. Ist ein Objekt in einer Tabelle gewählt, kommt das eingefügte in eine neue Zeile darunter. Mehrere Objekte aus einer Tabelle behalten dabei ihre Lage zueinander.

**Eine Spalte einstellen.** Über der Tabelle, mit der du arbeitest, liegt ein schmaler Streifen mit einem Balken pro Spalte. Ein Klick auf einen Balken zeigt die Spalte in den Eigenschaften. Unter <span class="ui">Width</span> wählst du, wie breit sie ist:

| Width | Breite |
|---|---|
| <span class="ui">Auto</span> | so breit wie ihr breitestes Objekt. Texte mit [Platzhalter](/objekte/anzeigen#platzhalter) zählen nicht mit, denn was sie zeigen, kennt erst das Gerät. |
| <span class="ui">Share</span> | ein Anteil in Prozent an dem, was die anderen Spalten übrig lassen |
| <span class="ui">Fixed (mm)</span> | fest in Millimetern, auf jedem Gerät gleich gross |
| <span class="ui">Size multiple</span> | ein Vielfaches der Höhe einer Grösse S, M oder L, etwa zweimal M |

<span class="ui">Align</span> legt fest, wo ein Objekt in der Spalte steht, das schmaler ist als sie: am Anfang, in der Mitte, am Ende, oder mit <span class="ui">Stretch</span> über die ganze Breite. Ist die Spalte <span class="ui">Auto</span> und auf <span class="ui">Stretch</span> gestellt, bestimmen nur Objekte mit eigener Breite, wie breit sie wird, etwa Knöpfe und Texte. Ein Slider oder Balken streckt sich bloss mit. <span class="ui">Vertical align</span> legt fest, wo ein Objekt in einer Zeile steht, die höher ist als es: oben, in der Mitte (so ist es, solange du nichts wählst) oder unten. Mit <span class="ui">Remove column</span> entfernst du die Spalte. Was nur in ihr stand, rückt in die ersten freien Zellen.

**Die Zelle eines Objekts.** Ein Objekt in einer Tabelle zeigt statt X, Y und Breite den Abschnitt <span class="ui">Cell</span>: Zeile, Spalte, wie viele Zeilen und Spalten es überspannt, und eine eigene Ausrichtung, die die der Spalte ersetzt. Ziehst du die rechte oder untere Kante eines Objekts über eine Linie, überspannt es die Zellen dahinter, so wie du in Word Zellen verbindest. Ein Titel über zwei Spalten entsteht so.

**Wie breit und wie hoch.** Die Höhe eines Objekts ist seine eigene: bei einem Schalter, einer Knopfgruppe oder einem Knopf die Grösse S, M oder L (unter <span class="ui">Size</span>, siehe [Switch](/objekte/bedienen#switch)), bei einem Text seine Schrift. Eine Zeile ist so hoch wie ihr höchstes Objekt, die anderen stehen in ihrer Mitte, ein Name also auf Höhe seines Schalters. Ein Objekt ist so breit, wie es braucht: ein Text so breit wie seine Wörter, ein Schalter so breit wie seine Beschriftung. Über die ganze Zelle geht, was keine eigene Breite hat, ein Balken oder Slider, ein Switcher, eine Tabelle in einer Tabelle. Ein Gauge oder Dial behält seinen Durchmesser, höchstens so gross, wie Platz ist. Schmaler als seine Beschriftung wird ein Bedienelement nie, und eine Spalte nie schmaler als ein Bedienelement darin, auch keines in einer Tabelle in ihr.

Passt nicht alles hinein, zeichnet der Designer es trotzdem, und das Gerät schneidet es am Rand des Screens ab. In den Eigenschaften der Tabelle steht dann ein Hinweis. Verkleinert wird nichts. Auf dem runden [Knob](/geraete/knob) ist das schnell der Fall: Ganz zu sehen ist dort nur ein Quadrat von 32 mm Seitenlänge.

Container kennt nur der Designer. Das Gerät bekommt die Objekte an den Stellen, die der Container ausgerechnet hat.

Projekte, die du mit einer früheren Fassung dieses Designers gebaut hast, können noch Stacks, Rows und Grids enthalten. Der Designer wandelt sie beim Laden in Tabellen um: einen Stack in eine Tabelle mit einer Spalte, eine Row in eine mit einer Zeile, ein Grid in eine mit seinen Spalten. Was du darin gebaut hast, steht danach an derselben Stelle.

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
