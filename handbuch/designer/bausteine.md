# Bausteine

Bausteine sind fertige Elemente, die schon an ihre Werte gebunden sind. Du musst kein Topic kennen: <span class="ui">Block</span> zeigt, was die Geräte auf deinem Broker anbieten, mit ihren eigenen Namen, und ein Baustein bindet sich selbst daran.

Die Einträge kommen von Geräten, die sich im Discovery-Format von Home Assistant anmelden, etwa Zigbee2MQTT, ESPHome, Tasmota, Shelly mit Skript oder OpenMQTTGateway. Sie legen für jedes Ding eine Beschreibung auf den Broker, unter einem Präfix, meist `homeassistant`. Der Designer liest dort nur mit und schickt selbst nichts. Welches Präfix er liest, stellst du beim [Broker](/designer/topics#topics-vom-broker-holen) unter <span class="ui">Discovery prefix</span> ein. Ohne Broker gibt es keine Bausteine.

Auf einem Pekaway-System kündigt die [VanPi-Brücke](/betrieb/vanpi-bruecke#ankuendigung) die Dinge deines Vans an, unter dem Gerät «VanPi».

<Screenshot narrow name="baustein-menue" alt="Das Block-Menü mit dem Gerät VanPi und darunter Abwasser, Batterie, Frischwasser, Leselicht, Licht und Theme" />

## So geht's

1. Klick in der Werkzeugleiste auf <span class="ui">Block</span>. Der Designer liest, was angekündigt ist, und listet es nach Geräten: das Gerät als Überschrift, darunter jedes Ding mit seinem eigenen Namen. Home Assistant nennt den Fühler «Cabin Temperature» des Geräts «van-sensors» «van-sensors Cabin Temperature», das Menü nur «Cabin Temperature». Hat ein Gerät nur ein Ding mit dem Namen des Geräts, steht es ohne Überschrift da.
2. Wähle einen Eintrag. Der Dialog zeigt die Topics des Eintrags und, wenn der Broker einen hat, den Wert, der gerade dort liegt.
3. Wähl unter <span class="ui">Look</span>, wie der Baustein aussehen soll, wo es mehr als eine Form gibt, und unter <span class="ui">Icon</span> ein Icon. Ein Eintrag mit mehreren Teilen kommt immer ganz, siehe [Mehrere Teile](#mehrere-teile).
4. Klick auf <span class="ui">Insert</span> und zieh auf dem Screen ein Rechteck auf. In einer Tabelle zeigt stattdessen eine leuchtende Zelle oder eine dicke Linie, wo der Baustein hinkommt, und ein Klick setzt ihn dort ab, siehe [In einer Tabelle](#in-einem-container). <span class="ui">Cancel</span> oder <kbd>Esc</kbd> brechen ab.

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

Eine Form, die dein Gerät nicht darstellen kann, ist im Dialog ausgegraut. Fährst du mit der Maus darüber, steht dort der Grund. Die Form <span class="ui">Number</span> zeigt den Wert als [Platzhalter](/objekte/anzeigen#platzhalter).

Jeder Baustein ist eine kleine [Tabelle](/objekte/anordnen#container): der Name in der ersten Spalte, das Bedienelement in der zweiten. Auf einem freien Screen kommt er als diese Tabelle, der Text und die Anzeige oder der Schalter werden also gemeinsam verschoben. Willst du nur eines davon ändern, doppelklickst du hinein oder wählst es in der Objektliste. Das Gerät bekommt die Objekte einzeln.

Alles Weitere, Farben, Grösse, die Beschriftung, änderst du danach in den Eigenschaften wie bei jedem anderen Objekt.

## Mehrere Teile

Lichter, Lüfter und Klimageräte bestehen aus mehreren Teilen. Ein Lüfter hat etwa einen Schalter (Power), Voreinstellungen (Preset), eine Geschwindigkeit (Speed), eine Drehrichtung (Direction) und das Schwenken (Oscillation), in dieser Reihenfolge, vom Groben zum Detail. Der Designer setzt immer alle Teile. Im Dialog wählst du nur die Form der Teile, die mehr als eine haben, etwa Slider oder Dial für die Geschwindigkeit.

Auf dem Screen steht links das Icon mit dem Namen, rechts daneben die Teile, untereinander. Jeder Baustein ist so eine Zeile mit zwei Spalten, und mehrere Bausteine untereinander ergeben eine Liste wie eine Tabelle. Die Teile tragen keine eigene Beschriftung: Ein Schalter sagt «An» oder «Aus», Knöpfe zeigen ihre Wörter, ein Regler seinen Wert. Das Rechteck, das du aufziehst, gibt Ort und Breite. Auf einem Gerät mit Grössen S, M und L kommen die Bedienelemente in der Grösse M, ob du ein Rechteck aufziehst oder den Baustein in eine Tabelle setzt. So ist derselbe Baustein überall gleich gross.

Brauchst du einen Teil nicht, etwa den Schalter eines Dimmers, der auch mit dem Regler auf 0 aus ist, löschst du ihn auf dem Screen. Doppelklick in die Gruppe, den Teil wählen, <kbd>Entf</kbd>.

## In einer Tabelle {#in-einem-container}

In einer [Tabelle](/objekte/anordnen#container) ziehst du kein Rechteck auf, und auf einem Screen mit [Layout](/designer/screens#layout) auch nicht. Nach <span class="ui">Insert</span> zeigt die Tabelle beim Überfahren, wohin der Baustein kommt. Das Bedienelement kommt in der Grösse M, die Breite gibt die Spalte.

- **Auf eine Linie zwischen zwei Zeilen**, dort erscheint eine dicke Linie: Der Baustein verschmilzt mit der Tabelle. Sein Name kommt in deren erste Spalte, sein Bedienelement in die zweite, mehrere Teile zusammen untereinander in dieser Zelle. Die Tabelle behält dabei ihre Spalten. Hat sie mehr, bleiben die übrigen Zellen leer. Hat sie nur eine, stehen Name und Bedienelemente untereinander. Setzt du mehrere Bausteine so untereinander, stehen alle Namen und alle Bedienelemente bündig.
- **Auf das <span class="ui">+</span> unter der Tabelle**: wie auf einer Linie, nur in einer neuen Zeile am Ende. Darüber wird die untere Linie der Tabelle dick.
- **In eine leere Zelle**, die aufleuchtet und ein <span class="ui">+</span> zeigt: Der Baustein kommt als eigene kleine Tabelle in diese Zelle. So stehen zwei Bausteine nebeneinander, etwa in den zwei Spalten von <span class="ui">Two columns</span>.

Ein Icon steht mit dem Namen in derselben Zelle.

## Was im Projekt landet

Neben den Objekten trägt der Designer die Topics ein, die der Baustein braucht. Du findest sie unter <span class="ui">Settings</span> › <span class="ui">Topics</span>:

- das Topic, aus dem er liest. Liegt der Wert in einer JSON-Nachricht, etwa `{"state":"ON"}`, ist es ein JSON-Topic mit dem Feld als Subtopic,
- das Topic, an das er seine Befehle schickt.

Als ersten Beispielwert bekommt jedes Topic, was beim Einfügen auf dem Broker lag. Die Vorschau zeigt so von Anfang an etwas, das nach deiner Anlage aussieht. Ein Topic, das schon im Projekt steht, lässt der Designer, wie es ist, auch wenn du seine Beispiele selbst eingetragen hast.
