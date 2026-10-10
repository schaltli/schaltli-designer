# Anordnen

## Zusammenstecken {#zusammenstecken}

Eine Tabelle baust du auch ohne Werkzeug. Ziehst du ein Objekt nahe an ein anderes heran, etwa einen Schalter rechts neben einen Text, zeigt eine Linie an dessen Rand, wo es hinkommt. Lässt du los, rasten die beiden zu einer Tabelle zusammen und stehen bündig nebeneinander.

Ziehst du ein weiteres Objekt an diese Tabelle, zeigt sie, wohin es kommt:

- Über einer leeren Zelle leuchtet die Zelle grün.
- An einer Kante erscheint eine dicke Linie zwischen zwei Spalten oder Zeilen, kräftig dort, wo das Objekt hinkommt, blass über den Rest. Beim Loslassen entsteht dort eine neue Spalte oder Zeile. Was schon dastand, bleibt an seinem Platz.

Mit einem neuen Objekt aus der Werkzeugleiste geht es genauso: Es hängt nach dem Druck auf den Screen am Mauszeiger, und trägst du es an ein anderes Objekt oder eine Tabelle heran, landet es gleich in der Tabelle. Eine Linie, die du zeichnest, rastet nicht ein; du verschiebst sie danach in eine Zelle. Massgebend sind die Kanten des Objekts, das du ziehst, nicht die Stelle, an der du es hältst. Es rastet ein, sobald eine seiner Kanten höchstens etwa 5 mm von der Kante des anderen Objekts oder der Tabelle entfernt ist, und die beiden nebeneinander auf gleicher Höhe oder untereinander in einer Flucht liegen. Weiter weg bleibt das Objekt frei liegen. Liegt die Mitte des Objekts über einer Tabelle, kommt es in die Zelle darunter. Willst du ein Objekt frei neben ein anderes legen, hältst du während des Ziehens <kbd>Strg</kbd> gedrückt (auf dem Mac <kbd>⌘</kbd>): Dann rastet nichts ein. Drück die Taste erst, wenn du schon ziehst, denn <kbd>Strg</kbd> beim Klick nimmt ein Objekt zur Auswahl hinzu. <kbd>Esc</kbd> während des Ziehens legt das Objekt an seinen Platz zurück, und <kbd>Strg</kbd>+<kbd>Z</kbd> nimmt das Einrasten in einem Schritt zurück. Gruppen rasten nicht ein.

In einem offenen Panel eines [Switchers](#switcher) und in einer offenen [Free-Fläche](#free) steckst du Objekte genauso zusammen wie auf dem Screen. Ein Switcher oder eine Free-Fläche selbst steht in einer Tabelle als ein einziges Objekt in einer Zelle, und was darin liegt, bleibt, wo es ist.

Eine Spalte ist so breit wie ihr breitestes Objekt, eine Zeile so hoch wie ihr höchstes. So stehen alle Schalter einer Spalte untereinander. Die Tabelle ist so gross wie ihr Inhalt, darum hat sie keine Anfasser zum Vergrössern, und die Objekte darin auch nicht.

**Auswählen.** Ein Klick auf die Tabelle wählt sie als Ganzes. Ihre Zellen zeigen sich dann gestrichelt, und ein Schild über der linken oberen Ecke nennt sie, etwa «Table · 3×2» für drei Spalten und zwei Zeilen. Ziehst du sie, verschiebst du sie mit allem darin. Ein Doppelklick wählt ein Objekt in der Tabelle, danach wählt ein Klick auf ein anderes Objekt derselben Tabelle dieses. <kbd>Esc</kbd> geht eine Stufe zurück, vom Objekt zur Tabelle und von dort zu nichts. <kbd>Enter</kbd> geht von der Tabelle zu ihrem ersten Objekt.

**Spalten breiter, Zeilen höher.** Eine gewählte Tabelle zeigt rechts jeder Spalte und unter jeder Zeile eine türkise Linie. Ziehst du daran, wird die Spalte breiter oder die Zeile höher, und neben dem Mauszeiger steht die Grösse in Millimetern. So hältst du Platz frei für einen Namen, der auf dem Gerät länger ankommt als im Designer: Die Positionen stehen nach dem Übertragen fest, auf dem Gerät wächst keine Spalte mit. Ob es reicht, siehst du in der Vorschau mit den echten Werten. Schmaler als ihr Inhalt wird eine Spalte nie. Ziehst du die Linie darunter, ist sie wieder automatisch, das Schild zeigt dann «auto». Eine Linie, deren Grösse du gesetzt hast, ist durchgezogen, eine automatische gestrichelt. <kbd>Strg</kbd>+<kbd>Z</kbd> nimmt ein Ziehen in einem Schritt zurück.

**Über mehrere Zellen.** Ein gewähltes Objekt in der Tabelle zeigt in der Mitte jeder Kante einen kleinen türkisen Griff mit einem Pfeil: ⇤ ⇥ ⤒ ⤓. Ziehst du daran, wächst das Objekt in die Nachbarzellen, nach links, rechts, oben oder unten, oder schrumpft wieder. So steht ein Titel über zwei Spalten oder ein grosser Gauge neben drei Schaltern. Wachsen kann es nur über leere Zellen; ist eine belegt, bleibt es, wie es war. Über den Rand der Tabelle hinaus geht es nicht. Brauchst du dort Platz, steck zuerst ein Objekt daneben. Das Schild über dem Objekt nennt, wie viele Spalten und Zeilen es überspannt, etwa «Text · 2×1». <kbd>Strg</kbd>+<kbd>Z</kbd> nimmt ein solches Ziehen in einem Schritt zurück.

**In den Eigenschaften.** Ein Objekt in einer solchen Tabelle zeigt statt X, Y und Breite den Abschnitt <span class="ui">Cell</span>. Unter <span class="ui">Align</span> stellst du es in seiner Zelle nach links, in die Mitte oder nach rechts, unter <span class="ui">Vertical align</span> nach oben, in die Mitte oder nach unten. Ohne Einstellung steht ein Text links, alles andere in der Mitte. Ein Button, eine Knopfgruppe, ein Bar, ein Slider, eine Box oder eine Free-Fläche kann seine Zelle mit <span class="ui">Fill</span> ausfüllen, in der Breite (<span class="ui">Width</span>) und bei Button, Box und Free-Fläche auch in der Höhe (<span class="ui">Height</span>). Über mehrere Zellen füllt er dann alle. Die Tabelle selbst zeigt unter <span class="ui">Table</span>, wie viele Spalten und Zeilen sie hat. Hast du eine Spalte breiter oder eine Zeile höher gezogen, setzt <span class="ui">Auto sizes</span> alle wieder auf automatisch. In der Objektliste stehen die Objekte einer Tabelle Zeile für Zeile, von links nach rechts.

**Herausnehmen.** Hast du ein Objekt in der Tabelle gewählt, ziehst du es heraus. Ein Umriss hängt am Mauszeiger, und wie beim Hineinziehen zeigt eine Linie oder eine grüne Zelle, wo es einrastet. Lässt du es weit weg von allem los, liegt es frei. Seine Zelle bleibt leer. Eine Zeile oder Spalte, in der danach nichts mehr steht, verschwindet, und was in der Tabelle bleibt, behält seinen Platz. Steht nur noch ein Objekt in der Tabelle, löst sie sich auf. <kbd>Esc</kbd> während des Ziehens lässt das Objekt in seiner Zelle.

Kopierst du ein Objekt aus einer Tabelle und fügst es ein, liegt die Kopie frei neben der Tabelle, nicht in ihr. In eine Zelle kommt sie, wenn du sie dorthin ziehst.

**Eine ganze Zeile.** Das Werkzeug <span class="ui">Row</span> setzt mehrere Objekte auf einmal. Sein Menü bietet <span class="ui">Icon · Label · Switch</span>, <span class="ui">Label · Switch</span>, <span class="ui">Icon · Switch</span> und <span class="ui">Label · Button</span>. Nach dem Druck auf den Screen hängt die Zeile am Mauszeiger wie ein einzelnes Objekt. Trägst du sie über oder unter eine Tabelle, zeigt eine dicke Linie, zwischen welche Zeilen sie kommt. Beim Loslassen kommt jedes Teil in die Spalte seiner Art: das Icon zu den Icons, der Text zu den Texten, der Schalter zu den Schaltern. Fehlt der Tabelle eine solche Spalte, bekommt sie eine, Icons links, Texte daneben, Bedienelemente rechts. Ein Schild nennt sie schon vor dem Loslassen, etwa «+ Icon column». Reicht ein Objekt über mehrere Zeilen und liegt die neue Zeile dazwischen, wird es um eine Zeile länger, und seine Spalte bleibt in der neuen Zeile frei. Weit weg von jeder Tabelle oder mit einem Klick wird die Zeile zu einer eigenen Tabelle. Mit <kbd>Strg</kbd> während des Ziehens kommt sie in keine Tabelle, <kbd>Esc</kbd> nimmt sie weg. Ein [Baustein](/designer/bausteine) aus einem Teil kommt genauso.

<Screenshot name="layout-linie" alt="Eine Tabelle mit zwei Bausteinen, darunter der Umriss eines weiteren Bausteins und die untere Linie der Tabelle dick" caption="Unter der Tabelle wird ihre untere Linie dick: Dort kommt der getragene Baustein als neue Zeile hin." />

## Container {#container}

Eine Tabelle ordnet, was du hineinlegst, in Zeilen und Spalten, wie eine Tabelle in Word. Jedes Objekt steht in seiner Zelle, so stehen Namen und Bedienelemente bündig untereinander. Du schiebst nichts auf den Pixel genau: Die Tabelle sagt, wo ein Objekt steht und wie breit es ist, und richtet sich neu ein, wenn sich etwas ändert, etwa die Grösse eines Schalters von M auf L oder das Gerät.

In der Werkzeugleiste steht dafür unter <span class="ui">Tables</span> das Werkzeug <span class="ui">Table</span>. Ein Klick darauf öffnet das Menü <span class="ui">Table template</span>, die Vorlagen, jede mit einem kleinen Bild:

| Vorlage | Spalten |
|---|---|
| <span class="ui">One column</span> | eine, alles untereinander |
| <span class="ui">Name and control</span> | zwei: links die Namen, so breit wie der längste, rechts die Bedienelemente im Rest |
| <span class="ui">Two columns</span> | zwei gleich breite |

Hast du eine Vorlage gewählt, steht das Werkzeug bereit, und oben auf der Zeichenfläche sagt ein Hinweis, was zu tun ist. Ein Klick auf den Screen setzt die Tabelle hin, ab dem Klickpunkt bis zum rechten Rand. Ziehst du stattdessen ein Rechteck auf, bestimmst du die Breite selbst. <kbd>Esc</kbd> legt das Werkzeug wieder weg. Die Tabelle beginnt mit einer Zeile. Ein [Baustein](/designer/bausteine) auf dem Screen bringt seine eigene Tabelle mit.

**Die Linien.** Eine Tabelle zeigt im Designer immer ihre Linien, dünn, grau und gestrichelt, auch um leere Zellen. Eine Tabelle endet mit ihrer letzten Zeile. Die Tabelle, mit der du gerade arbeitest, zeigt ihre Linien kräftig in Türkis: wenn sie ausgewählt ist oder ein Objekt darin. In der Vorschau und auf dem Gerät sind keine Linien zu sehen.

**In eine Tabelle setzen.** Wähl ein Werkzeug, etwa <span class="ui">Text</span>, und fahr über eine Tabelle. Über einer leeren Zelle leuchtet die Zelle auf, ein Klick setzt das Objekt hinein. Über einer Linie zwischen zwei Zeilen erscheint eine dicke Linie, ein Klick schiebt dort eine neue Zeile ein, und alles darunter rückt eine Zeile nach unten. Solange ein Werkzeug oder ein Baustein bereitsteht, zeigt jede leere Zelle ein <span class="ui">+</span>, und unter jeder Tabelle steht eines. Fährst du über das <span class="ui">+</span> unter der Tabelle, wird ihre untere Linie dick, und ein Klick hängt das Objekt in einer neuen Zeile an. Bei einer Tabelle, die in einer anderen steht, erscheint dieses <span class="ui">+</span> erst, wenn du über sie fährst, sonst läge es mitten in der nächsten Zeile. Unter der letzten Zeile nimmt eine Tabelle nichts. Eine belegte Zelle nimmt ebenfalls nichts. Ein Rechteck ziehst du in einer Tabelle nicht auf, Platz und Breite gibt die Tabelle. Einzig ein Ring behält seinen Durchmesser, bis zur Breite der Zelle. In einem Free und auf dem Screen ziehst du wie gewohnt ein Rechteck auf.

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
| <span class="ui">Auto</span> | so breit wie ihr breitestes Objekt. Texte mit [Werten](/objekte/anzeigen#platzhalter) zählen nicht mit, denn was sie zeigen, kennt erst das Gerät. |
| <span class="ui">Share</span> | ein Anteil in Prozent an dem, was die anderen Spalten übrig lassen |
| <span class="ui">Fixed (mm)</span> | fest in Millimetern, auf jedem Gerät gleich gross |
| <span class="ui">Size multiple</span> | ein Vielfaches der Höhe einer Grösse XS, S, M oder L, etwa zweimal M |

<span class="ui">Align</span> legt fest, wo ein Objekt in der Spalte steht, das schmaler ist als sie: am Anfang, in der Mitte, am Ende, oder mit <span class="ui">Stretch</span> über die ganze Breite. Ist die Spalte <span class="ui">Auto</span> und auf <span class="ui">Stretch</span> gestellt, bestimmen nur Objekte mit eigener Breite, wie breit sie wird, etwa Knöpfe und Texte. Ein Slider oder Balken streckt sich bloss mit. <span class="ui">Vertical align</span> legt fest, wo ein Objekt in einer Zeile steht, die höher ist als es: oben, in der Mitte (so ist es, solange du nichts wählst) oder unten. Mit <span class="ui">Remove column</span> entfernst du die Spalte. Was nur in ihr stand, rückt in die ersten freien Zellen.

**Die Zelle eines Objekts.** Ein Objekt in einer Tabelle zeigt statt X, Y und Breite den Abschnitt <span class="ui">Cell</span>: Zeile, Spalte, wie viele Zeilen und Spalten es überspannt, und eine eigene Ausrichtung, die die der Spalte ersetzt. Ziehst du die rechte oder untere Kante eines Objekts über eine Linie, überspannt es die Zellen dahinter, so wie du in Word Zellen verbindest. Ein Titel über zwei Spalten entsteht so.

**Wie breit und wie hoch.** Die Höhe eines Objekts ist seine eigene: bei einem Schalter, einer Knopfgruppe oder einem Knopf die Grösse XS, S, M oder L (unter <span class="ui">Size</span>, siehe [Switch](/objekte/bedienen#switch)), bei einem Text seine Schrift. Eine Zeile ist so hoch wie ihr höchstes Objekt, die anderen stehen in ihrer Mitte, ein Name also auf Höhe seines Schalters. Ein Objekt ist so breit, wie es braucht: ein Text so breit wie seine Wörter, ein Schalter so breit wie seine Beschriftung. Über die ganze Zelle geht, was keine eigene Breite hat, ein Balken oder Slider, ein Switcher, eine Tabelle in einer Tabelle. Ein Gauge oder Dial behält seinen Durchmesser, höchstens so gross, wie Platz ist. Schmaler als seine Beschriftung wird ein Bedienelement nie, und eine Spalte nie schmaler als ein Bedienelement darin, auch keines in einer Tabelle in ihr.

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

## Navigator {#navigator}

Eine Leiste am Rand mit einem Eintrag für jeden Screen. Ein Tipp auf einen Eintrag öffnet diesen Screen, und der Eintrag des offenen Screens ist in der Akzentfarbe des Themes hervorgehoben. So kommst du ohne langes Wischen zur Heizung, auch bei zehn Screens.

Du legst den Navigator auf einen [Master](/designer/screens#master-screens). Jeder Screen, der diesen Master verwendet, zeigt ihn dann. Das Werkzeug <span class="ui">Navigator</span> steht nur auf einem Master, der noch keinen hat, und nur bei Geräten mit rechteckigem Display: 4.3B, PaperS3 und Android-App. Der runde Knob hat dafür sein Screen-Menü.

Ein Klick auf den Master setzt ihn an den linken Rand. Verschieben oder in der Grösse ändern lässt er sich nicht, das erledigen seine Eigenschaften unter <span class="ui">Layout</span>:

- <span class="ui">Edge</span>: links, rechts, oben oder unten. Der Navigator füllt diese Kante ganz aus.
- <span class="ui">Shows</span>: <span class="ui">Icons</span> oder <span class="ui">Icons and text</span>. Das Icon ist das Icon des Screens, der Text sein Name. Mit Text wird die Leiste breiter.
- <span class="ui">Font</span>: die Schrift der Namen, nur bei <span class="ui">Icons and text</span>.

Die Farben kommen aus dem Theme: der Grund aus «Surface», Icons und Namen aus «Text», der offene Eintrag aus «Accent» und «Text on accent».

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

<span class="ui">Free</span> ist eine freie Fläche: Was du hineinsetzt, bleibt, wo du es hinsetzt, wie auf dem Screen. Nützlich ist das dort, wo sonst eine Tabelle alles anordnet. In einer Tabellenzelle stellst du so ein paar Objekte von Hand zusammen, etwa einen Dial mit einer Beschriftung genau daneben. Du findest das Werkzeug neben <span class="ui">Table</span>. Auf den Screen setzt du die Fläche wie jedes Objekt, 30 × 20 mm gross, und machst sie an ihren Anfassern grösser oder kleiner. In einer leeren Zelle genügt ein Klick, und in einem offenen Panel eines Switchers geht es wie auf dem Screen.

In einer Zelle gibt die Spalte die Breite vor, die Höhe stellst du unter <span class="ui">Frame</span> ein. Um etwas hineinzusetzen, öffnest du die Fläche: mit einem Klick auf ihre Zeile in der Objektliste, oder auf dem Screen mit einem Doppelklick, in einer Tabelle mit zweien, denn der erste öffnet die Tabelle. Solange sie offen ist, landet jedes neue Objekt in ihr, genau dort, wo du es loslässt.

Eine Free-Fläche kann wie eine [Box](/objekte/zeichnen#box) aussehen: unter <span class="ui">Fill</span> eine Füllung, unter <span class="ui">Stroke</span> und <span class="ui">Stroke width</span> ein Rand, unter <span class="ui">Corner radius</span> runde Ecken. Ohne Füllung und Rand sieht man sie auf dem Gerät nicht. Das Gerät bekommt eine Box hinter den Objekten der Fläche und die Objekte selbst, an derselben Stelle.

## Gruppe {#gruppe}

Eine Gruppe hält Objekte zusammen, etwa einen Text und den Slider darunter oder einen Text und den Schalter daneben. Die Objekte bleiben, was sie sind; sie werden nur gemeinsam verschoben. [Bausteine](/designer/bausteine) kommen schon als Gruppe auf den Screen.

Zum Gruppieren wählst du die Objekte aus, mit <kbd>Strg</kbd>-Klick oder mit einem Rahmen, den du um sie ziehst, und drückst <kbd>Strg</kbd>+<kbd>G</kbd>. Dasselbe steht als <span class="ui">Group</span> im Menü der rechten Maustaste und unter <span class="ui">Arrange</span> in den Eigenschaften mehrerer Objekte. Die Objekte müssen am selben Ort liegen: alle direkt auf dem Screen, alle im selben Panel oder alle in derselben Gruppe. Switcher und Panels kommen in keine Gruppe.

Aufgelöst wird eine Gruppe mit <kbd>Strg</kbd>+<kbd>U</kbd> oder <kbd>Strg</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>, mit <span class="ui">Ungroup</span> im Menü der rechten Maustaste oder in ihren Eigenschaften. Die Objekte bleiben, wo sie sind, und sind danach ausgewählt.

Ein Klick auf eines ihrer Objekte wählt die ganze Gruppe; Ziehen und die Pfeiltasten verschieben sie als Ganzes. Anfasser zum Vergrössern hat sie keine, denn ihre Grösse ergibt sich aus den Objekten darin. Mit einem Doppelklick gehst du hinein: Der übrige Screen wird blass, ein violetter Rahmen zeigt die Gruppe, und ein Klick wählt jetzt ein einzelnes Objekt. Ein Rahmen, den du hier ziehst, fängt nur Objekte der Gruppe. Neue Objekte landen dann in der Gruppe. <kbd>Esc</kbd> oder ein Klick neben die Gruppe führt wieder hinaus.

In der Objektliste unter <span class="ui">Objects</span> stehen die Objekte eingerückt unter ihrer Gruppe. Wählst du eines davon aus, bist du in der Gruppe wie nach einem Doppelklick. Ziehst du ein Objekt auf die Mitte der Zeile einer Gruppe, kommt es hinein; ziehst du es anderswohin, verlässt es sie. Kommst du beim Ziehen an den oberen oder unteren Rand der Liste, scrollt sie mit, umso schneller, je näher am Rand. Hältst du ein Objekt einen Moment über einer zugeklappten Gruppe oder Tabelle, klappt sie auf. Das Schloss an der Gruppe sperrt sie als Ganzes.

Kopieren und Einfügen nimmt die Gruppe mit allem darin mit. Verlässt das letzte Objekt eine Gruppe, verschwindet sie.

Gruppen gibt es nur im Designer. Beim Übertragen löst der Designer sie auf, und das Gerät bekommt die einzelnen Objekte an derselben Stelle und in derselben Reihenfolge.
