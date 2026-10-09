# Verbund statt Tabelle

Ideenpapier vom 2026-10-09. Noch nicht entschieden; der Prototyp
(`docs/ideas/verbund-prototyp.html`) soll die Annahmen unten prüfen.

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

## Richtung

Die Tabelle als Objekt, das man zuerst zeichnet, verschachtelt und in der
Grösse zieht, fällt weg. An ihre Stelle tritt der Verbund: Wer einen Switch an
einen anderen heranzieht, lässt ihn einrasten, und eine Einfügelinie zwischen
Spalten oder Reihen zeigt, wo er landet. So holt man mehrere Switches und reiht
sie aneinander.

Intern ist ein Verbund ein flaches Raster ohne Nesting. Jede Zelle hält genau
ein Control; Icon und Label sind zwei Spalten. Eine Spalte ist so breit wie ihr
breitestes Control, eine Reihe so hoch wie ihr höchstes. Damit stehen die
Spalten über alle Reihen bündig, und wird ein Control grösser, rücken die
Nachbarn mit.

Die Auswahl hat immer genau zwei Ebenen. Ein Klick wählt den Verbund, ein
Doppelklick das Control darin, ein Klick auf ein anderes Control im selben
Verbund bleibt auf der Control-Ebene, Esc geht eine Ebene hoch. Wer am
gewählten Verbund zieht, verschiebt ihn ganz; wer am gewählten Control zieht,
holt es heraus. Ein einzelnes Control ohne Nachbarn ist kein Verbund, sondern
ein freies Objekt. Einen Grössengriff hat der Verbund nicht; seine Grösse folgt
aus den XS–L-Stufen seiner Controls.

Mehrere Controls auf einmal kommen als Reihe. Ein Bündel ist mal Icon, Label
und Bedienteil, mal nur Label und Bedienteil oder Icon und Bedienteil. Darum
hat jede Spalte eines Verbunds eine Rolle, die sich aus ihrem Inhalt ergibt:
Icon, Label oder Control. Eine eingefügte Reihe legt jedes Teil in die Spalte
seiner Rolle. Fehlt ein Teil, bleibt seine Zelle leer und der Switch steht
trotzdem unter den anderen Switches. Fehlt dem Verbund die Spalte für eine
Rolle, entsteht sie in der Reihenfolge Icon, Label, Control. Reihen gibt es
als Vorlagen in der Palette («Icon · Label · Switch», «Label · Switch»,
«Icon · Switch», «Label · Button»). Eine frei abgelegte Vorlage ist der
Anfang eines neuen Verbunds. Reihen entstehen von Hand und aus der Discovery
etwa gleich oft. Ein Baustein aus dem Insert-Dialog soll deshalb als dieselbe
Reihe kommen, nur mit Topics, und Teile, die im Dialog abgewählt sind, bleiben
leere Zellen.

Ein komplexer Baustein wie die Heizung kommt in keinen fremden Verbund. Er
ist ein eigener Verbund neben den anderen.

Die heutigen Probleme kommen aus Container plus Nesting. Ein unsichtbares
Raster mit fester Tiefe zwei lässt sie gar nicht erst entstehen, statt sie mit
weiteren Griffen zu flicken.

Verworfen wurde eine sichtbare, flache Tabelle mit Klick/Doppelklick wie in
Figma. Intern wäre sie dasselbe Raster, aber man müsste sie weiterhin zuerst
zeichnen. Verworfen wurden auch Modulraster, ein einmaliger «Arrange as
grid»-Befehl und reine Hilfslinien: Keines davon merkt sich, wer zusammengehört,
und gewünscht ist, dass Nachbarn rücken.

## Annahmen, die zu prüfen sind

- [ ] Zwei Ebenen reichen, kein echter Screen braucht eine Gruppe in einer
  Gruppe. Prüfen: bestehende Projekte durchsehen, ob sich jedes Nesting in ein
  flaches Raster mit Spalten umbauen lässt.
- [ ] Einrasten in 2D ist eindeutig: Es ist auf Anhieb klar, ob ein Control
  neben oder unter einem anderen landet. Prüfen: im Prototyp fünf Switches
  reihen und eine zweite Reihe darunter bauen.
- [ ] «Nachbarn rücken» heisst, dass Spalten und Reihen sich anpassen, nicht
  dass Controls über Spaltengrenzen rutschen; das würde die bündigen Spalten
  zerstören. Löschen lässt eine Lücke, eine ganz leere Spalte oder Reihe fällt
  weg. Prüfen: ob sich das im Prototyp richtig anfühlt.
- [ ] Vorerst geht es ohne Span. Ein grosser Gauge neben zwei gestapelten
  Switches bräuchte einen. Prüfen: wie oft das in echten Screens vorkommt.
- [x] Die Firmware kennt nur absolute Positionen. Bestätigt:
  `docs/2026-10-04-block-grid.md` hält fest, dass der Export Tabellen in
  platzierte Objekte auflöst.
- [ ] Eine Reihe hat höchstens ein Control. Bei zwei Switches in einer Reihe
  («Licht innen | aussen») werden die Teile innerhalb ihrer Rolle nach
  Reihenfolge zugeordnet. Prüfen: ob das in echten Screens reicht.

## MVP

Zuerst der HTML-Prototyp: Controls aus der Palette holen, einrasten, Verbund
und Control auswählen, herausziehen, mehrere Verbünde pro Screen, XS–L ändern
und zusehen, wie die Nachbarn rücken. Erst wenn sich das gut anfühlt, kommt
der Verbund als Objekttyp in den Designer, flach und ohne Span, mit einer
Migration nur für Tabellen ohne Nesting.

Dazu Reihen-Vorlagen mit Spalten-Rollen; im Prototyp seit dem 2026-10-09.

Nicht im MVP: Spans, die Migration verschachtelter Tabellen, Abstände pro
Verbund, Reihe duplizieren (Ctrl+D), Mehrfachauswahl mit Rechteck.

## Bewusst nicht

- Nesting: Es war nur dafür da, mehrere Controls in eine Zelle zu bekommen.
  Das übernehmen jetzt die Spalten.
- Mehrere Controls pro Zelle: Das wäre dieselbe Sonderlogik an anderem Ort.
- Responsives Layout und Grössengriffe am Verbund: Schaltli hat fixe Grössen,
  und ein Griff, der nichts tut, ist schlimmer als keiner.
- Ein Modulraster über den ganzen Screen: Die XS–L-Stufen sind Millimeter je
  Art (`lib/size-scale.ts`: Switch M 8 mm, Icon M 6 mm), kein gemeinsames Mass.
- Ketten nur in einer Reihe: Die Spalten müssen über die Reihen bündig sein.

## Offene Fragen

- Was wird aus der Root-Tabelle jedes Screens (`migrateScreenToTables`) und aus
  den Screens, die die Discovery erzeugt? Freie Screens mit Verbünden?
- Wie richtet sich ein Control in seiner Zelle aus: links, Mitte, je nach Art?
  Ein Label links und ein Switch rechts sind wohl die Regel.
- Wie heisst das Ding im UI? «Block» ist für Bridge-Bausteine vergeben
  (`lib/block-description.ts`). Vorschläge: «Group», «Grid».
