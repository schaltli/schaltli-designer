# Anordnen

## Zusammenstecken {#zusammenstecken}

Eine Tabelle entsteht, wenn du Objekte zusammensteckst. Ziehst du ein Objekt nahe an ein anderes heran, etwa einen Schalter rechts neben einen Text, zeigt eine Linie an dessen Rand, wo es hinkommt. Lässt du los, rasten die beiden zu einer Tabelle zusammen und stehen bündig nebeneinander.

Ziehst du ein weiteres Objekt an diese Tabelle, zeigt sie, wohin es kommt:

- Über einer leeren Zelle leuchtet die Zelle grün.
- An einer Kante erscheint eine dicke Linie zwischen zwei Spalten oder Zeilen, kräftig dort, wo das Objekt hinkommt, blass über den Rest. Beim Loslassen entsteht dort eine neue Spalte oder Zeile. Was schon dastand, bleibt an seinem Platz.

Mit einem neuen Objekt aus der Werkzeugleiste geht es genauso: Es hängt nach dem Druck auf den Screen am Mauszeiger, und trägst du es an ein anderes Objekt oder eine Tabelle heran, landet es gleich in der Tabelle. Eine Linie, die du zeichnest, rastet nicht ein; du verschiebst sie danach in eine Zelle.

Massgebend sind die Kanten des Objekts, das du ziehst, nicht die Stelle, an der du es hältst. Es rastet ein, sobald eine seiner Kanten höchstens etwa 5 mm von der Kante des anderen Objekts oder der Tabelle entfernt ist und die beiden nebeneinander auf gleicher Höhe oder untereinander in einer Flucht liegen. Weiter weg bleibt das Objekt frei liegen. Liegt seine Mitte über einer Tabelle, kommt es in die Zelle darunter. Willst du ein Objekt frei neben ein anderes legen, hältst du während des Ziehens <kbd>Strg</kbd> gedrückt (auf dem Mac <kbd>⌘</kbd>): Dann rastet nichts ein. Drück die Taste erst, wenn du schon ziehst, denn <kbd>Strg</kbd> beim Klick nimmt ein Objekt zur Auswahl hinzu. <kbd>Esc</kbd> während des Ziehens legt das Objekt an seinen Platz zurück, und <kbd>Strg</kbd>+<kbd>Z</kbd> nimmt das Einrasten in einem Schritt zurück. Gruppen rasten nicht ein.

In einem offenen Panel eines [Switchers](#switcher) und in einer offenen [Free-Fläche](#free) steckst du Objekte genauso zusammen wie auf dem Screen. Ein Switcher oder eine Free-Fläche selbst steht in einer Tabelle als ein einziges Objekt in einer Zelle, und was darin liegt, bleibt, wo es ist.

Eine Spalte ist so breit wie ihr breitestes Objekt, eine Zeile so hoch wie ihr höchstes. So stehen alle Schalter einer Spalte untereinander. Die Tabelle ist so gross wie ihr Inhalt, darum hat sie keine Anfasser zum Vergrössern, und die Objekte darin auch nicht. Wie breit eine Box, ein Bar, ein Slider oder eine Free-Fläche in der Tabelle ist, stellst du in den Eigenschaften unter <span class="ui">Frame</span> ein, und die Spalte richtet sich danach. Einen Text oder ein Bedienelement macht seine Beschriftung so breit, wie es ist.

**Auswählen.** Ein Klick auf die Tabelle wählt sie als Ganzes. Ihre Zellen zeigen sich dann gestrichelt, und ein Schild über der linken oberen Ecke nennt sie, etwa «Table · 3×2» für drei Spalten und zwei Zeilen. Ziehst du sie, verschiebst du sie mit allem darin. Ein Doppelklick wählt ein Objekt in der Tabelle, danach wählt ein Klick auf ein anderes Objekt derselben Tabelle dieses. <kbd>Esc</kbd> geht eine Stufe zurück, vom Objekt zur Tabelle und von dort zu nichts. <kbd>Enter</kbd> geht von der Tabelle zu ihrem ersten Objekt.

**Spalten breiter, Zeilen höher.** Eine gewählte Tabelle zeigt rechts jeder Spalte und unter jeder Zeile eine türkise Linie. Ziehst du daran, wird die Spalte breiter oder die Zeile höher, und neben dem Mauszeiger steht die Grösse in Millimetern. So hältst du Platz frei für einen Namen, der auf dem Gerät länger ankommt als im Designer: Die Positionen stehen nach dem Übertragen fest, auf dem Gerät wächst keine Spalte mit. Ob es reicht, siehst du in der Vorschau mit den echten Werten. Schmaler als ihr Inhalt wird eine Spalte nie. Ziehst du die Linie darunter, ist sie wieder automatisch, das Schild zeigt dann «auto». Eine Linie, deren Grösse du gesetzt hast, ist durchgezogen, eine automatische gestrichelt. <kbd>Strg</kbd>+<kbd>Z</kbd> nimmt ein Ziehen in einem Schritt zurück.

**Über mehrere Zellen.** Ein gewähltes Objekt in der Tabelle zeigt in der Mitte jeder Kante einen kleinen türkisen Griff mit einem Pfeil: ⇤ ⇥ ⤒ ⤓. Ziehst du daran, wächst das Objekt in die Nachbarzellen, nach links, rechts, oben oder unten, oder schrumpft wieder. So steht ein Titel über zwei Spalten oder ein grosser Gauge neben drei Schaltern. Wachsen kann es nur über leere Zellen; ist eine belegt, bleibt es, wie es war. Über den Rand der Tabelle hinaus geht es nicht. Brauchst du dort Platz, steck zuerst ein Objekt daneben. Das Schild über dem Objekt nennt, wie viele Spalten und Zeilen es überspannt, etwa «Text · 2×1». <kbd>Strg</kbd>+<kbd>Z</kbd> nimmt ein solches Ziehen in einem Schritt zurück.

**In den Eigenschaften.** Ein Objekt in einer solchen Tabelle zeigt statt X und Y den Abschnitt <span class="ui">Cell</span>. Unter <span class="ui">Align</span> stellst du es in seiner Zelle nach links, in die Mitte oder nach rechts, unter <span class="ui">Vertical align</span> nach oben, in die Mitte oder nach unten. Ohne Einstellung steht ein Text links, alles andere in der Mitte. Ein Button, eine Knopfgruppe, ein Bar, ein Slider, eine Box oder eine Free-Fläche kann seine Zelle mit <span class="ui">Fill</span> ausfüllen, in der Breite (<span class="ui">Width</span>) und bei Button, Box und Free-Fläche auch in der Höhe (<span class="ui">Height</span>). Über mehrere Zellen füllt es dann alle. Die Tabelle selbst zeigt unter <span class="ui">Table</span>, wie viele Spalten und Zeilen sie hat. Hast du eine Spalte breiter oder eine Zeile höher gezogen, setzt <span class="ui">Auto sizes</span> alle wieder auf automatisch. In der Objektliste stehen die Objekte einer Tabelle Zeile für Zeile, von links nach rechts.

**Herausnehmen.** Hast du ein Objekt in der Tabelle gewählt, ziehst du es heraus. Ein Umriss hängt am Mauszeiger, und wie beim Hineinziehen zeigt eine Linie oder eine grüne Zelle, wo es einrastet. Lässt du es weit weg von allem los, liegt es frei. Seine Zelle bleibt leer. Eine Zeile oder Spalte, in der danach nichts mehr steht, verschwindet, und was in der Tabelle bleibt, behält seinen Platz. Steht nur noch ein Objekt in der Tabelle, löst sie sich auf. <kbd>Esc</kbd> während des Ziehens lässt das Objekt in seiner Zelle.

Kopierst du ein Objekt aus einer Tabelle und fügst es ein, liegt die Kopie frei neben der Tabelle, nicht in ihr. In eine Zelle kommt sie, wenn du sie dorthin ziehst.

**Eine ganze Zeile.** Das Werkzeug <span class="ui">Row</span> setzt mehrere Objekte auf einmal. Sein Menü bietet <span class="ui">Icon · Label · Switch</span>, <span class="ui">Label · Switch</span>, <span class="ui">Icon · Switch</span> und <span class="ui">Label · Button</span>. Nach dem Druck auf den Screen hängt die Zeile am Mauszeiger wie ein einzelnes Objekt. Trägst du sie über oder unter eine Tabelle, zeigt eine dicke Linie, zwischen welche Zeilen sie kommt. Beim Loslassen kommt jedes Teil in die Spalte seiner Art: das Icon zu den Icons, der Text zu den Texten, der Schalter zu den Schaltern. Fehlt der Tabelle eine solche Spalte, bekommt sie eine, Icons links, Texte daneben, Bedienelemente rechts. Ein Schild nennt sie schon vor dem Loslassen, etwa «+ Icon column». Reicht ein Objekt über mehrere Zeilen und liegt die neue Zeile dazwischen, wird es um eine Zeile länger, und seine Spalte bleibt in der neuen Zeile frei. Weit weg von jeder Tabelle oder mit einem Klick wird die Zeile zu einer eigenen Tabelle. Mit <kbd>Strg</kbd> während des Ziehens kommt sie in keine Tabelle, <kbd>Esc</kbd> nimmt sie weg. Ein [Baustein](/designer/bausteine) aus einem Teil kommt genauso.

<Screenshot name="layout-linie" alt="Eine Tabelle mit zwei Bausteinen, darunter der Umriss eines weiteren Bausteins und die untere Linie der Tabelle dick" caption="Unter der Tabelle wird ihre untere Linie dick: Dort kommt der getragene Baustein als neue Zeile hin." />

## Tabellen auf dem Gerät {#auf-dem-geraet}

Tabellen kennt nur der Designer. Das Gerät bekommt jedes Objekt einzeln, an der Stelle, an der es in der Tabelle steht. Auf dem Gerät wächst darum keine Spalte mit einem längeren Wert. Wie viel Platz du brauchst, zeigt die [Vorschau](/designer/vorschau) mit den echten Werten.

**Ältere Projekte.** Ein Projekt aus einer früheren Fassung des Designers kann noch Tabellen des alten Werkzeugs «Table» enthalten, auch ineinander verschachtelte, und noch ältere Stacks, Rows und Grids. Beim Laden löst der Designer sie auf: Jedes Objekt bleibt genau dort stehen, wo es zuletzt stand, liegt danach aber frei. Willst du sie wieder bündig in einer Tabelle haben, steckst du sie zusammen, siehe [Zusammenstecken](#zusammenstecken).

## Switcher {#switcher}

Ein Bereich, der je nach Wert eines Topics einen anderen Inhalt zeigt. Beispiel: Je nachdem, ob die Heizung im Modus «Heizen» oder «Lüften» läuft, zeigt derselbe Bereich andere Anzeigen und Regler.

Ein Switcher besteht aus Panels. Jedes Panel ist eine eigene kleine Fläche mit eigenen Objekten, und jedes hat eine Bedingung. Gezeigt wird das erste Panel, dessen Bedingung passt.

- <span class="ui">Topic</span> unter <span class="ui">Data</span>: der Wert, gegen den alle Panels prüfen.
- <span class="ui">Panels</span>: die Liste der Panels, von oben gelesen. Jedes hat <span class="ui">Shown when</span> mit einer [Bedingung](/objekte/gemeinsames#bedingungen), etwa `== heizen`, und <span class="ui">Open for editing</span>. <span class="ui">Add panel</span> fügt eines hinzu.

Alle Panels füllen den Switcher genau aus. Verschieben und Grösse ändern kannst du nur den Switcher selbst.

**Bearbeiten:** Ist der Switcher ausgewählt, erscheinen über ihm Reiter, einer pro Panel. Ein Klick auf einen Reiter öffnet dieses Panel. Neue Objekte landen dann darin. <span class="ui">+</span> bei den Reitern fügt ein Panel hinzu. In der Objektliste kannst du Objekte auch in ein Panel ziehen.

Ohne Wert zeigt der Switcher das erste Panel.

Die Reiter gibt es nur im Designer. Auf dem Gerät sieht man immer nur das gerade gültige Panel.

## Navigator {#navigator}

Eine Leiste am Rand mit einem Eintrag für jeden Screen. Ein Tipp auf einen Eintrag öffnet diesen Screen, und der Eintrag des offenen Screens ist in der Akzentfarbe des Themes hervorgehoben. So kommst du ohne langes Wischen zur Heizung, auch bei zehn Screens.

Du legst den Navigator auf einen [Master](/designer/screens#master-screens). Jeder Screen, der diesen Master verwendet, zeigt ihn dann. Das Werkzeug <span class="ui">Navigator</span> steht nur auf einem Master, der noch keinen hat, und nur bei Geräten mit rechteckigem Display: 4.3B, PaperS3 und Android-App. Der runde Knob hat dafür sein Screen-Menü.

Ein Klick auf den Master setzt ihn an den linken Rand. Verschieben oder in der Grösse ändern lässt er sich nicht, das erledigen seine Eigenschaften unter <span class="ui">Layout</span>:

- <span class="ui">Edge</span>: links, rechts, oben oder unten. Der Navigator füllt diese Kante ganz aus.
- <span class="ui">Shows</span>: <span class="ui">Icons</span> oder <span class="ui">Icons and text</span>. Das Icon ist das Icon des Screens, der Text sein Name. Mit Text wird die Leiste breiter.
- <span class="ui">Font</span>: die Schrift der Namen, nur bei <span class="ui">Icons and text</span>.

Die Farben kommen aus dem Theme: der Grund aus «Panel», eine Linie zum Screen hin aus «Outline», Icons und Namen aus «Text», der offene Eintrag aus «Accent» und «Text on accent». So hebt sich die Leiste vom Screen ab.

**Die Einträge:** einer pro Screen, in der Reihenfolge der Screen-Liste. Master, Popups und Screens mit <span class="ui">Hide screen</span> fehlen. Einen neuen Screen nimmt der Navigator von selbst auf. Passen alle Einträge hin, teilen sie sich die Kante. Sonst scrollst du den Navigator mit einem Wisch entlang der Leiste, und der letzte sichtbare Eintrag ist angeschnitten, damit man sieht, dass es weitergeht. Nach jedem Screenwechsel scrollt er so weit, dass der offene Eintrag zu sehen ist. Ein Wisch auf dem Navigator scrollt nur und blättert nie, ein Wisch daneben blättert wie bisher.

**Was er zeigt:** Ist das Icon eines Screens auf <span class="ui">Live</span> gestellt, zeigt der Navigator gleich, wie es dort steht, etwa eine erleuchtete Glühbirne, solange irgendwo ein Licht brennt. Wie das geht, steht unter [Die Eigenschaften eines Screens](/designer/screens#die-eigenschaften-eines-screens).

Auf den Screens, die den Master verwenden, ist sein Streifen beim Bearbeiten schraffiert, damit du nicht aus Versehen etwas darunter legst. Verboten ist es nicht: Der Navigator deckt zu, was darunter liegt, auch ein Hintergrundbild. In der Vorschau probierst du ihn aus. Ein Klick öffnet einen Screen, Ziehen entlang der Leiste scrollt.

Auf dem PaperS3 folgt die Leiste dem Finger nicht, das E-Paper reagiert erst beim Loslassen. Ein Wisch auf dem Navigator blättert dort eine ganze Seite Einträge weiter.

::: warning Ältere Firmware
4.3B, PaperS3 und Android-App zeigen den Navigator ab Systemgeneration 1.5. Mit älterer Firmware oder einer älteren App fehlt er, und beim Übertragen nennt der Dialog ihn. Abhilfe schafft ein [Firmware-Update](/geraete/firmware-updates) oder eine neue App.
:::

## Panel {#panel}

Panels legst du nicht mit einem Werkzeug an, sondern im Switcher. Ausgewählt zeigen sie nur ihre Bedingung unter <span class="ui">Shown when</span>. Position und Grösse übernehmen sie vom Switcher.

## Free {#free}

<span class="ui">Free</span> ist eine freie Fläche: Was du hineinsetzt, bleibt, wo du es hinsetzt, wie auf dem Screen. Nützlich ist das dort, wo sonst eine Tabelle alles anordnet. In einer Tabellenzelle stellst du so ein paar Objekte von Hand zusammen, etwa einen Dial mit einer Beschriftung genau daneben. Das Werkzeug steht in der Gruppe <span class="ui">Tables</span>. Auf den Screen setzt du die Fläche wie jedes Objekt, 30 × 20 mm gross, und machst sie an ihren Anfassern grösser oder kleiner. In eine Tabelle steckst du sie wie jedes andere Objekt, und in einem offenen Panel eines Switchers geht es wie auf dem Screen.

In einer Zelle behält die Fläche ihre Grösse, und ihre Spalte richtet sich danach. Breite und Höhe stellst du dort unter <span class="ui">Frame</span> ein, oder sie füllt mit <span class="ui">Fill</span> ihre Zelle. Um etwas hineinzusetzen, öffnest du die Fläche: mit einem Klick auf ihre Zeile in der Objektliste, oder auf dem Screen mit einem Doppelklick, in einer Tabelle mit zweien, denn der erste öffnet die Tabelle. Solange sie offen ist, landet jedes neue Objekt in ihr, genau dort, wo du es loslässt.

Eine Free-Fläche kann wie eine [Box](/objekte/zeichnen#box) aussehen: unter <span class="ui">Fill</span> eine Füllung, unter <span class="ui">Stroke</span> und <span class="ui">Stroke width</span> ein Rand, unter <span class="ui">Corner radius</span> runde Ecken. Ohne Füllung und Rand sieht man sie auf dem Gerät nicht. Das Gerät bekommt eine Box hinter den Objekten der Fläche und die Objekte selbst, an derselben Stelle.

## Gruppe {#gruppe}

Eine Gruppe hält Objekte zusammen, etwa einen Text und den Slider darunter oder einen Text und den Schalter daneben. Die Objekte bleiben, was sie sind; sie werden nur gemeinsam verschoben. [Bausteine](/designer/bausteine) kommen schon als Gruppe auf den Screen.

Zum Gruppieren wählst du die Objekte aus, mit <kbd>Strg</kbd>-Klick oder mit einem Rahmen, den du um sie ziehst, und drückst <kbd>Strg</kbd>+<kbd>G</kbd>. Dasselbe steht als <span class="ui">Group</span> im Menü der rechten Maustaste und unter <span class="ui">Arrange</span> in den Eigenschaften mehrerer Objekte. Die Objekte müssen am selben Ort liegen: alle direkt auf dem Screen, alle im selben Panel oder alle in derselben Gruppe. Switcher und Panels kommen in keine Gruppe.

Aufgelöst wird eine Gruppe mit <kbd>Strg</kbd>+<kbd>U</kbd> oder <kbd>Strg</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>, mit <span class="ui">Ungroup</span> im Menü der rechten Maustaste oder in ihren Eigenschaften. Die Objekte bleiben, wo sie sind, und sind danach ausgewählt.

Ein Klick auf eines ihrer Objekte wählt die ganze Gruppe; Ziehen und die Pfeiltasten verschieben sie als Ganzes. Anfasser zum Vergrössern hat sie keine, denn ihre Grösse ergibt sich aus den Objekten darin. Mit einem Doppelklick gehst du hinein: Der übrige Screen wird blass, ein violetter Rahmen zeigt die Gruppe, und ein Klick wählt jetzt ein einzelnes Objekt. Ein Rahmen, den du hier ziehst, fängt nur Objekte der Gruppe. Neue Objekte landen dann in der Gruppe. <kbd>Esc</kbd> oder ein Klick neben die Gruppe führt wieder hinaus.

In der Objektliste unter <span class="ui">Objects</span> stehen die Objekte eingerückt unter ihrer Gruppe. Wählst du eines davon aus, bist du in der Gruppe wie nach einem Doppelklick. Ziehst du ein Objekt auf die Mitte der Zeile einer Gruppe, kommt es hinein; ziehst du es anderswohin, verlässt es sie. Kommst du beim Ziehen an den oberen oder unteren Rand der Liste, scrollt sie mit, umso schneller, je näher am Rand. Hältst du ein Objekt einen Moment über einer zugeklappten Gruppe oder Tabelle, klappt sie auf. Das Schloss an der Gruppe sperrt sie als Ganzes.

Kopieren und Einfügen nimmt die Gruppe mit allem darin mit. Verlässt das letzte Objekt eine Gruppe, verschwindet sie.

Gruppen gibt es nur im Designer. Beim Übertragen löst der Designer sie auf, und das Gerät bekommt die einzelnen Objekte an derselben Stelle und in derselben Reihenfolge.
