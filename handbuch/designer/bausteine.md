# Bausteine

Bausteine sind fertige Elemente, die schon an ihre Werte gebunden sind. Du musst kein Topic kennen: <span class="ui">Block</span> zeigt, was die Geräte auf deinem Broker anbieten, mit ihren eigenen Namen, und ein Baustein bindet sich selbst daran.

Die Einträge kommen von Geräten, die sich im Discovery-Format von Home Assistant anmelden, etwa Zigbee2MQTT, ESPHome, Tasmota, Shelly mit Skript oder OpenMQTTGateway. Sie legen für jedes Ding eine Beschreibung auf den Broker, unter einem Präfix, meist `homeassistant`. Der Designer liest dort nur mit und schickt selbst nichts. Welches Präfix er liest, stellst du beim [Broker](/designer/topics#topics-vom-broker-holen) unter <span class="ui">Discovery prefix</span> ein. Ohne Broker gibt es keine Bausteine.

Manche Absender beschreiben ein Gerät zusätzlich als Ganzes, in einem eigenen Format von Schaltli unter `schaltli/blocks`. Dann steht im Menü dieser eine fertige Baustein, und die einzelnen Einträge, die er ersetzt, fallen weg. Mehr dazu unter [Teile je nach Betrieb](#je-nach-betrieb).

Auf einem Pekaway-System kündigt die [VanPi-Brücke](/betrieb/vanpi-bruecke#ankuendigung) die Dinge deines Vans an, unter dem Gerät «VanPi».

<Screenshot narrow name="baustein-menue" alt="Das Block-Menü mit dem Gerät VanPi und darunter Abwasser, Batterie, Frischwasser, Leselicht, Licht und Theme" />

## So geht's

1. Klick in der Werkzeugleiste auf <span class="ui">Block</span>. Der Designer liest, was angekündigt ist, und listet es nach Geräten: das Gerät als Überschrift, darunter jedes Ding mit seinem eigenen Namen. Home Assistant nennt den Fühler «Cabin Temperature» des Geräts «van-sensors» «van-sensors Cabin Temperature», das Menü nur «Cabin Temperature». Hat ein Gerät nur ein Ding mit dem Namen des Geräts, steht es ohne Überschrift da.
2. Wähle einen Eintrag. Der Dialog zeigt die Topics des Eintrags und, wenn der Broker einen hat, den Wert, der gerade dort liegt.
3. Wähl unter <span class="ui">Look</span>, wie der Baustein aussehen soll, wo es mehr als eine Form gibt, und unter <span class="ui">Icon</span> ein Icon. Ein Eintrag mit mehreren Teilen kommt ganz, siehe [Mehrere Teile](#mehrere-teile). Teilt eine Beschreibung ihn in Abschnitte, wählst du unter <span class="ui">Sections</span> ab, was du nicht brauchst, siehe [Abschnitte](#abschnitte).
4. Klick auf <span class="ui">Insert</span>. Nach dem Druck auf den Screen hängt der Baustein am Mauszeiger. Du trägst ihn an seinen Platz und lässt los, ein Klick setzt ihn gleich dort ab. Einen Baustein aus einem Teil kannst du auch in eine Tabelle tragen, siehe [In einer Tabelle](#in-einem-container). Sucht der Designer noch nach dem Icon, zeigt der Knopf <span class="ui">Waiting for icon…</span> und setzt den Baustein ab, sobald das Icon da ist. <span class="ui">Cancel</span> oder <kbd>Esc</kbd> brechen ab.

Als Icon schlägt der Dialog vor, was das Gerät in seiner Ankündigung nennt. Nennt es keines, sucht er eines zum Namen. Mit <span class="ui">Change...</span> suchst du selbst ein anderes, mit <span class="ui">None</span> lässt du es weg. Das Icon kommt einmal in die Assets des Projekts, auch wenn du den Baustein mehrmals einfügst. Ist der Icon-Dienst nicht erreichbar, sagt der Dialog das, und der Baustein kommt ohne Icon auf den Screen.

<Screenshot narrow name="baustein-tank" alt="Der Dialog Insert Frischwasser mit Topic, aktuellem Wert, Look und Icon" />

Die Beschriftung ist der Name des Dings als fester Text, im Stil <span class="ui">Label</span>, siehe [Stile](/objekte/anzeigen#stile). Auf Geräten, die ihre Grösse noch nicht in Millimetern angeben, wählt der Designer die Schrift passend zur Grösse des Screens.

## Was entsteht

| angekündigt als | auf dem Screen | <span class="ui">Look</span> |
|---|---|---|
| Schalter (`switch`) | der Name und daneben zwei Knöpfe «Aus» und «An», oder mit den Wörtern des Geräts, wenn es nicht ein und aus meldet | – |
| Zustand (`binary_sensor`) | der Name und daneben der gemeldete Zustand als Text | – |
| Messwert (`sensor`) | der Name und der Wert mit seiner Einheit; bei Prozent und Batterie auch als Balken oder Ring | <span class="ui">Number</span>, bei Prozent <span class="ui">Bar</span> und <span class="ui">Gauge</span> |
| Zahl (`number`) | der Name und darunter ein Regler im Bereich und in den Schritten des Geräts | <span class="ui">Slider</span>, <span class="ui">Dial</span> |
| Auswahl (`select`) | der Name und daneben ein Knopf je Möglichkeit | <span class="ui">Buttons</span> |
| Taste (`button`) | ein Button mit dem Namen, der beim Antippen die Nachricht des Geräts schickt | – |

Was der Designer nicht setzen kann, steht ausgegraut im Menü, mit dem Grund, etwa «Not supported: the value template: arithmetic (/ 1000)». Das sind Geräte, deren Ankündigung Werte erst umrechnet oder Befehle aus Vorlagen zusammensetzt. Solche Werte bindest du von Hand, siehe [Topics](/designer/topics).

Eine Form, die dein Gerät nicht darstellen kann, ist im Dialog ausgegraut. Fährst du mit der Maus darüber, steht dort der Grund. Die Form <span class="ui">Number</span> zeigt den Wert als [Chip in einem Text](/objekte/anzeigen#platzhalter).

Ein Baustein aus einem Teil ist eine Zeile: das Icon, der Name und das Bedienelement, jedes ein eigenes Objekt. Lässt du ihn frei los oder klickst nur, wird er zu einer [Tabelle](/objekte/anordnen#zusammenstecken) mit einer Zeile, und du verschiebst Text und Bedienelement gemeinsam. Ein Baustein aus mehreren Teilen ist eine eigene Tabelle, siehe [Mehrere Teile](#mehrere-teile). Willst du nur ein Objekt darin ändern, doppelklickst du hinein oder wählst es in der Objektliste. Das Gerät bekommt die Objekte einzeln.

Alles Weitere, Farben, Grösse, die Beschriftung, änderst du danach in den Eigenschaften wie bei jedem anderen Objekt.

## Mehrere Teile {#mehrere-teile}

Lichter, Lüfter und Klimageräte bestehen aus mehreren Teilen. Ein Lüfter hat etwa einen Schalter (Power), Voreinstellungen (Preset), eine Geschwindigkeit (Speed), eine Drehrichtung (Direction) und das Schwenken (Oscillation), in dieser Reihenfolge, vom Groben zum Detail. Der Designer setzt immer alle Teile. Im Dialog wählst du nur die Form der Teile, die mehr als eine haben, etwa Slider oder Dial für die Geschwindigkeit.

Ein solcher Baustein ist eine eigene [Tabelle](/objekte/anordnen#zusammenstecken). In ihrer ersten Zeile stehen das Icon, der Name und der erste Teil, der Name oben bündig mit dem ersten Teil. Jeder weitere Teil kommt in eine Zeile darunter, in die Spalte der Bedienelemente. Die Teile füllen diese Spalte und enden an derselben Kante. Bedienelemente tragen keine eigene Beschriftung: Ein Schalter sagt «An» oder «Aus», Knöpfe zeigen ihre Wörter, ein Regler seinen Wert. Was nur angezeigt wird, steht dagegen mit seinem Namen da, etwa «Spannung 13.3 V». Eine Zahl allein sagt nicht, was sie ist. Auf einem Gerät mit Grössen XS bis L kommen die Bedienelemente in der Grösse M, ausser die Beschreibung will für einen Teil eine andere, etwa XS für eine Taste wie «Nullen». So ist derselbe Baustein überall gleich gross.

Ein Baustein aus mehreren Teilen kommt nie in eine andere Tabelle. Trägst du ihn auf eine, zeigt sie keine Linie, und beim Loslassen liegt er frei an dieser Stelle. Verschieb ihn danach, wohin er gehört.

Brauchst du einen Teil nicht, etwa den Schalter eines Dimmers, der auch mit dem Regler auf 0 aus ist, löschst du ihn auf dem Screen. Doppelklick in die Tabelle, den Teil wählen, <kbd>Entf</kbd>.

## Teile je nach Betrieb {#je-nach-betrieb}

Bei manchen Geräten zählt je nach Betriebsart ein anderer Regler. Ein Dachlüfter im Automatikbetrieb hält eine Temperatur, von Hand läuft er mit einer festen Stufe, und ausgeschaltet gibt es nichts einzustellen. Das Discovery-Format von Home Assistant kann das nicht ausdrücken. Ein Absender, der sein Gerät kennt, kann es aber in seiner eigenen Beschreibung sagen. Die [VanPi-Brücke](/betrieb/vanpi-bruecke#ankuendigung) tut das für den MaxxFan und die Heizung.

Aus so einer Beschreibung setzt der Designer die Teile, die nur in einer Betriebsart gelten, in einen [Switcher](/objekte/anordnen#switcher) mit einem Panel pro Betriebsart. Auf dem Screen steht dann immer nur der Regler, der gerade gilt, und in einer Betriebsart ohne Regler steht dort nichts. Der Switcher steht in einer Zelle und ist so hoch wie sein höchstes Panel, darum rückt beim Wechsel der Betriebsart nichts darunter nach. Die übrigen Teile, etwa die Wahl der Betriebsart, stehen wie gewohnt untereinander. Die Knöpfe tragen die Wörter, die der Absender dafür vorsieht, etwa «Aus», «Hand» und «Auto» statt `off`, `fan_only` und `auto`, und wo er eines nennt, ein Icon.

Ein Baustein kann mehrere Switcher haben, je einen für jedes Topic, nach dem sich Teile richten. Bei der Heizung zeigt einer den Regler der Betriebsart, ein zweiter die Laufzeit, solange der Timer an ist.

Meldet der Absender zu einem Regler auch den gemessenen Wert, zeigt die Füllung diesen Istwert und der Griff den Sollwert. Bei der Heizung füllt sich der Bogen bis zur Raumtemperatur, und der Griff steht auf der Zieltemperatur. Im Eigenschaften-Panel ist der Istwert das <span class="ui">Topic</span> und der Sollwert das <span class="ui">Setpoint topic</span>.

In der [Vorschau](/designer/vorschau) wechselt der Regler mit der Betriebsart, und du kannst ihn dort auch ziehen. Am [Knob](/geraete/knob) legst du den Drehring auf den Switcher, dann stellt er immer den Regler, der gerade zu sehen ist, siehe [Einen Regler stellen](/designer/tasten#regler).

## Abschnitte {#abschnitte}

Eine eigene Beschreibung kann ihre Teile in Abschnitte gliedern, etwa bei der Heizung in «Laufzeit» und «Verbrauch». Der Dialog zeigt dann unter <span class="ui">Sections</span> ein Häkchen pro Abschnitt. Alle sind gesetzt, ohne Zutun kommt also der ganze Baustein. Was du abwählst, fehlt auf dem Screen. Teile ohne Abschnitt kommen immer, bei der Heizung der Zustand und die Betriebsart mit ihren Reglern. Was du erst auf dem Screen nicht mehr willst, löschst du dort wie jeden Teil.

Ein Teil kann auch ein Text sein, der so erscheint, wie er auf dem Broker liegt, etwa «2.100 l seit 05.12.2024 18:00h». Er bekommt die ganze Breite seiner Zeile.

## Zwei Spalten {#zwei-spalten}

Ein Baustein mit vielen Teilen wird untereinander schnell höher als der Screen. Eine eigene Beschreibung kann ihre Teile deshalb auf zwei Spalten verteilen. Teile ohne Spalte gehen dann über beide Spalten, die übrigen stehen in zwei Spalten nebeneinander, jede von oben nach unten. Hat eine Seite weniger Teile, reicht ihr letzter Teil über die übrigen Zeilen der anderen. Mehrere solche Abschnitte mit zwei Spalten kann sie untereinander setzen. Eine Taste in der zweiten Spalte nimmt nur so viel Platz, wie sie braucht. Einen Text kann die Beschreibung klein setzen, im Stil <span class="ui">Caption</span>, und für einen Schalter die Form <span class="ui">Switch</span> statt der Knöpfe wählen. Stehen in einer solchen Zeile auf beiden Seiten Dials, stehen sie unten auf derselben Linie.

Die Heizung der VanPi-Brücke hat zuoberst klein ihren Zustand, darunter die Betriebsart über die ganze Breite. Dann stehen nebeneinander der Regler der Betriebsart und der Timer, zuunterst der Verbrauch mit «Nullen» daneben. So passt sie auf einen Screen von 800 × 480.

Ein Dial in einem Baustein kommt etwa sechs Schriftzeilen gross, auf dem 4.3B rund 140 px. Seinen Durchmesser änderst du danach unter <span class="ui">Frame</span> › <span class="ui">Diameter</span>, höchstens bis zur Breite seiner Spalte.

## In einer Tabelle {#in-einem-container}

Ein Baustein aus einem Teil kommt in eine Tabelle wie eine Zeile des Werkzeugs <span class="ui">Row</span>, siehe [Eine ganze Zeile](/objekte/anordnen#zusammenstecken). Trägst du ihn über oder unter eine Tabelle, zeigt eine dicke Linie, zwischen welche Zeilen er kommt. Beim Loslassen kommt das Icon zu den Icons, der Name zu den Namen und das Bedienelement zu den Bedienelementen. Hat der Baustein kein Icon, bleibt seine Zelle in der Icon-Spalte leer. Setzt du mehrere Bausteine so untereinander, stehen alle Namen und alle Bedienelemente bündig. Ein Knopf wie «Restart» trägt seinen Namen selbst und kommt allein in die Spalte der Bedienelemente.

Ein Baustein aus mehreren Teilen kommt in keine Tabelle, siehe [Mehrere Teile](#mehrere-teile).

## Was im Projekt landet

Neben den Objekten trägt der Designer die Topics ein, die der Baustein braucht. Du findest sie unter <span class="ui">Settings</span> › <span class="ui">Topics</span>:

- das Topic, aus dem er liest. Liegt der Wert in einer JSON-Nachricht, etwa `{"state":"ON"}`, ist es ein JSON-Topic mit dem Feld als Subtopic,
- das Topic, an das er seine Befehle schickt.

Als ersten Beispielwert bekommt jedes Topic, was beim Einfügen auf dem Broker lag. Die Vorschau zeigt so von Anfang an etwas, das nach deiner Anlage aussieht. Ein Topic, das schon im Projekt steht, lässt der Designer, wie es ist, auch wenn du seine Beispiele selbst eingetragen hast.
