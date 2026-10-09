# Tabelle zum Zusammenstecken

Ideenpapier vom 2026-10-09, abgeschlossen am selben Tag: Die Annahmen sind
bestätigt, das Papier ist die Grundlage für die Spec. Zwei Prototypen zeigen
es:
`docs/ideas/tabelle-prototyp.html` (Zusammenstecken, Reihen, Rollen) und
`docs/ideas/tabelle-prototyp-spans.html` (Spans, Spaltenbreite, Fill, Align).
Bis zum 2026-10-09 hiess die neue Tabelle hier «Verbund».

## Problem

Wie stehen Controls mit fixer Grösse in kleinen Gruppen sauber in Reih und
Glied, beliebig viele Gruppen pro Screen, ohne dass man dafür einen Container
zeichnen und bedienen muss?

Heute ist das die Tabelle (`lib/table.ts`). Mit ihr zu arbeiten ist mühsam,
vor allem mit einer verschachtelten: Ein Klick auf die Tabelle wählt immer das
innerste Kind (`cellAt`), die Tabelle selbst erreicht man nur über einen
kleinen Griff, der beim Hovern erscheint. Die Eckgriffe einer Tabelle in einer
Zelle ändern höchstens den Span und sonst nichts, und Esc führt nicht eine
Ebene hoch. Verschachtelt wurde bisher nur, um mehr als ein Control in eine
Zelle zu bekommen, etwa Icon und Label.

Was die Tabelle nicht sein soll: ein dynamischer Container für responsives
Layout. Schaltli arbeitet mit fixen Grössen; die Tabelle dient nur dem
Ausrichten.

## Entscheide

- **Der Name bleibt «Table»** (2026-10-09). Das Ding hat Zeilen, Spalten,
  Zellen und Spans, es ist eine Tabelle; neu ist nur, wie sie entsteht. Die
  Leute suchen danach (Arno suchte das Werkzeug «Table»), und weil die alte
  Tabelle verschwindet, gibt es keinen Namenskonflikt. Im deutschen Text heisst
  sie Tabelle, in der UI «Table». Verworfen: «Dock»/«AutoDock» (beschreibt die
  Geste, nicht das Ding; AutoDock ist eine bekannte Software), «Group» (gibt es
  schon, Ctrl+G), «Grid» (klingt nach Hilfsraster), «Stack» (nur eine
  Dimension).
- **Das Werkzeug «Table» mit Vorlagen fällt weg** (2026-10-09). Eine Tabelle
  entsteht, sobald zwei Objekte zusammenrasten. Darum dürfen leere Spalten und
  Reihen wegfallen: Eine leere Tabelle gibt es nicht.
- **Keine Migration** (2026-10-09). Bestehende Projekte verlieren ihre
  Tabellen: Deren Objekte bleiben als freie Objekte an ihrem Platz. Es gibt
  keine Kundendaten, die man schützen müsste.
- **Keine eigene Vorschau mit langen Texten** (2026-10-09). Ob eine Spalte
  breit genug ist, zeigt die normale Vorschau des Designers mit den echten
  Werten.

## Richtung

Wer einen Switch an einen anderen heranzieht, lässt ihn einrasten, und eine
Einfügelinie zwischen Spalten oder Reihen zeigt, wo er landet. So holt man
mehrere Switches und reiht sie aneinander.

Intern ist eine Tabelle ein flaches Raster ohne Nesting. Jede Zelle hält genau
ein Control; Icon und Label sind zwei Spalten. Eine Spalte ist so breit wie ihr
breitestes Control, eine Reihe so hoch wie ihr höchstes. Damit stehen die
Spalten über alle Reihen bündig, und wird ein Control grösser, rücken die
Nachbarn mit.

Die Auswahl hat immer genau zwei Ebenen. Ein Klick wählt die Tabelle, ein
Doppelklick das Control darin, ein Klick auf ein anderes Control in derselben
Tabelle bleibt auf der Control-Ebene, Esc geht eine Ebene hoch. Wer an der
gewählten Tabelle zieht, verschiebt sie ganz; wer am gewählten Control zieht,
holt es heraus. Ein einzelnes Control ohne Nachbarn ist keine Tabelle, sondern
ein freies Objekt.

Mehrere Controls auf einmal kommen als Reihe. Ein Bündel ist mal Icon, Label
und Bedienteil, mal nur Label und Bedienteil oder Icon und Bedienteil. Darum
hat jede Spalte eine Rolle, die sich aus ihrem Inhalt ergibt: Icon, Label oder
Control. Eine eingefügte Reihe legt jedes Teil in die Spalte seiner Rolle.
Fehlt ein Teil, bleibt seine Zelle leer und der Switch steht trotzdem unter
den anderen Switches. Fehlt der Tabelle die Spalte für eine Rolle, entsteht
sie in der Reihenfolge Icon, Label, Control. Reihen gibt es als Vorlagen in der
Palette («Icon · Label · Switch», «Label · Switch», «Icon · Switch», «Label ·
Button»). Eine frei abgelegte Vorlage ist der Anfang einer neuen Tabelle.
Reihen entstehen von Hand und aus der Discovery etwa gleich oft. Ein Baustein
aus dem Insert-Dialog soll deshalb als dieselbe Reihe kommen, nur mit Topics,
und Teile, die im Dialog abgewählt sind, bleiben leere Zellen.

Ein komplexer Baustein wie die Heizung kommt in keine fremde Tabelle. Er ist
eine eigene Tabelle neben den anderen.

Eine Spaltenbreite, die nur aus der Textlänge folgt, ist gefährlich, weil der
Text dynamisch ist. Namen kommen später aus Pekaway oder Home Assistant, und
die Positionen werden beim Export fest (`docs/2026-10-04-block-grid.md`): Auf
dem Gerät wächst keine Spalte mit. Im Designer sieht es also nach genug Platz
aus, und auf dem Gerät reicht es dann nicht. Darum:

- Spaltenbreite und Reihenhöhe lassen sich an der gewählten Tabelle ziehen,
  nie schmaler als der Inhalt. Wer darunter zieht, stellt sie wieder auf
  automatisch.
- Ein Control wächst in alle vier Richtungen in leere Nachbarzellen (Span).
  Ein Span zählt für die Spaltenbreite nicht mit; nur wenn er nicht
  hineinpasst, wird seine letzte Spalte breiter. Fügt man mitten in einem Span
  eine Reihe oder Spalte ein, wächst er mit. Ein herausgezogenes Control
  verliert seinen Span.
- Buttons füllen mit «Fill» die Breite und/oder Höhe ihrer Zelle bzw. ihres
  Spans, Texte und andere Controls nicht.
- Jedes Control lässt sich mit «Align» links, mittig oder rechts und oben,
  mittig oder unten in seine Zelle stellen.

Die heutigen Probleme kommen aus Container plus Nesting. Ein unsichtbares
Raster mit fester Tiefe zwei lässt sie gar nicht erst entstehen, statt sie mit
weiteren Griffen zu flicken.

Verworfen wurde eine sichtbare, flache Tabelle mit Klick/Doppelklick wie in
Figma: Intern wäre sie dasselbe Raster, aber man müsste sie weiterhin zuerst
zeichnen. Verworfen wurden auch Modulraster, ein einmaliger «Arrange as
grid»-Befehl und reine Hilfslinien: Keines davon merkt sich, wer zusammengehört,
und gewünscht ist, dass Nachbarn rücken.

## Annahmen

Alle bestätigt am 2026-10-09.

- [x] Zwei Ebenen reichen, kein echter Screen braucht eine Tabelle in einer
  Tabelle.
- [x] Einrasten in 2D ist eindeutig. Im Prototyp bestätigt (2026-10-09): «Das
  Control landet da, wo ich es erwarte.»
- [x] «Nachbarn rücken» heisst, dass Spalten und Reihen sich anpassen, nicht
  dass Controls über Spaltengrenzen rutschen. Löschen lässt eine Lücke, eine
  ganz leere Spalte oder Reihe fällt weg. Im Prototyp bestätigt (2026-10-09):
  Die Lücke beim Herausziehen passt.
- [x] Spans gehören dazu: ⇤ ⇥ ⤒ ⤓ im zweiten Prototyp tun, was man erwartet.
- [x] Die Firmware kennt nur absolute Positionen:
  `docs/2026-10-04-block-grid.md` hält fest, dass der Export Tabellen in
  platzierte Objekte auflöst.
- [x] Bei zwei Controls in einer Reihe («Licht innen | aussen») reicht es, die
  Teile innerhalb ihrer Rolle nach Reihenfolge zuzuordnen.

## MVP

Die neue Tabelle als Objekttyp im Designer: Einrasten mit Einfügelinie,
Auswahl auf zwei Ebenen, Herausziehen, Reihen-Vorlagen mit Spalten-Rollen,
Spans in alle vier Richtungen, Spaltenbreite und Reihenhöhe von Hand, Align,
Fill für Buttons. Die alte
Tabelle und das Werkzeug «Table» fallen weg; ihre Objekte werden beim Laden zu
freien Objekten. Die Bausteine aus dem Insert-Dialog und der Discovery kommen
als Reihen.

Nicht im MVP: Abstände pro Tabelle, Reihe duplizieren (Ctrl+D), Mehrfachauswahl mit Rechteck.

## Bewusst nicht

- Nesting: Es war nur dafür da, mehrere Controls in eine Zelle zu bekommen.
  Das übernehmen jetzt die Spalten.
- Mehrere Controls pro Zelle: Das wäre dieselbe Sonderlogik an anderem Ort.
- Responsives Layout und ein Grössengriff für die ganze Tabelle: Schaltli hat
  fixe Grössen. Grösser wird eine Tabelle über ihre Spalten und Reihen.
- Ein Modulraster über den ganzen Screen: Die XS–L-Stufen sind Millimeter je
  Art (`lib/size-scale.ts`: Switch M 8 mm, Icon M 6 mm), kein gemeinsames Mass.
- Ketten nur in einer Reihe: Die Spalten müssen über die Reihen bündig sein.
- Das Werkzeug «Table» mit Vorlagen und leere Tabellen.
- Eine Migration bestehender Tabellen.

## Offene Fragen

- Was macht das Gerät mit einem Text, der nicht in seine Zelle passt:
  abschneiden, mit «…» kürzen oder kleiner schreiben?
- Gilt «Align» pro Control oder pro Spalte? Der Prototyp hat es pro Control.
- Braucht ausser Buttons noch ein anderes Control «Fill», etwa ein Slider?
- Was wird aus der Root-Tabelle jedes Screens (`migrateScreenToTables`) und aus
  den Screens, die die Discovery erzeugt? Vermutlich freie Screens mit
  Tabellen; zu klären in der Spec.
- Wie richtet sich ein Control in seiner Zelle aus, solange niemand «Align»
  setzt? Der Prototyp nimmt Label links, alles andere mittig.
- Eine Spalte mitten in ein Control einzufügen, das über zwei Spalten und zwei
  Reihen geht, kann in der neuen Reihe mit einem Teil zusammenstossen. Die
  Einfügung muss dann ausweichen oder abgelehnt werden.
