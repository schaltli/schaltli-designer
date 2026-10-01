# Bausteine

Bausteine sind fertige Elemente, die schon an ihre Werte gebunden sind. Du musst kein Topic kennen: <span class="ui">Block</span> zeigt, was die Geräte auf deinem Broker anbieten, mit ihren eigenen Namen, und ein Baustein bindet sich selbst daran.

Die Einträge kommen von Geräten, die sich im Discovery-Format von Home Assistant anmelden, etwa Zigbee2MQTT, ESPHome, Tasmota, Shelly mit Skript oder OpenMQTTGateway. Sie legen für jedes Ding eine Beschreibung auf den Broker, unter einem Präfix, meist `homeassistant`. Der Designer liest dort nur mit und schickt selbst nichts. Welches Präfix er liest, stellst du beim [Broker](/designer/topics#topics-vom-broker-holen) unter <span class="ui">Discovery prefix</span> ein. Ohne Broker gibt es keine Bausteine.

Auf einem Pekaway-System kündigt die [VanPi-Brücke](/betrieb/vanpi-bruecke#ankuendigung) die Dinge deines Vans an, unter dem Gerät «VanPi».

<Screenshot narrow name="baustein-menue" alt="Das Block-Menü mit dem Gerät VanPi und darunter Abwasser, Batterie, Frischwasser, Leselicht, Licht und Theme" />

## So geht's

1. Klick in der Werkzeugleiste auf <span class="ui">Block</span>. Der Designer liest, was angekündigt ist, und listet es nach Geräten: das Gerät als Überschrift, darunter jedes Ding mit seinem eigenen Namen. Home Assistant nennt den Fühler «Cabin Temperature» des Geräts «van-sensors» «van-sensors Cabin Temperature», das Menü nur «Cabin Temperature». Hat ein Gerät nur ein Ding mit dem Namen des Geräts, steht es ohne Überschrift da.
2. Wähle einen Eintrag. Der Dialog zeigt die Topics des Eintrags und, wenn der Broker einen hat, den Wert, der gerade dort liegt.
3. Wähl unter <span class="ui">Look</span>, wie der Baustein aussehen soll, und unter <span class="ui">Icon</span> ein Icon. Hat der Eintrag mehrere Teile, wählst du unter <span class="ui">Parts</span>, welche davon kommen, siehe [Mehrere Teile](#mehrere-teile).
4. Klick auf <span class="ui">Insert</span> und zieh auf dem Screen ein Rechteck auf. <span class="ui">Cancel</span> oder <kbd>Esc</kbd> brechen ab.

Als Icon schlägt der Dialog vor, was das Gerät in seiner Ankündigung nennt. Nennt es keines, sucht er eines zum Namen. Mit <span class="ui">Change...</span> suchst du selbst ein anderes, mit <span class="ui">None</span> lässt du es weg. Das Icon kommt einmal in die Assets des Projekts, auch wenn du den Baustein mehrmals einfügst. Ist der Icon-Dienst nicht erreichbar, sagt der Dialog das, und der Baustein kommt ohne Icon auf den Screen.

<Screenshot narrow name="baustein-tank" alt="Der Dialog Insert Frischwasser mit Topic, aktuellem Wert, Look und Icon" />

Die Beschriftung ist der Name des Dings als fester Text, im Stil <span class="ui">Label</span>, siehe [Stile](/objekte/anzeigen#stile). Auf Geräten, die ihre Grösse noch nicht in Millimetern angeben, wählt der Designer die Schrift passend zur Grösse des Screens.

## Was entsteht

| angekündigt als | auf dem Screen | <span class="ui">Look</span> |
|---|---|---|
| Schalter (`switch`) | der Name und daneben ein Schalter mit «Aus» und «An», oder mit den Wörtern des Geräts, wenn es nicht ein und aus meldet | <span class="ui">Switch</span>, <span class="ui">Buttons</span> |
| Zustand (`binary_sensor`) | der Name und daneben der gemeldete Zustand als Text | – |
| Messwert (`sensor`) | der Name und der Wert mit seiner Einheit; bei Prozent und Batterie auch als Balken oder Ring | <span class="ui">Number</span>, bei Prozent <span class="ui">Bar</span> und <span class="ui">Gauge</span> |
| Zahl (`number`) | der Name und darunter ein Regler im Bereich und in den Schritten des Geräts | <span class="ui">Slider</span>, <span class="ui">Dial</span> |
| Auswahl (`select`) | der Name und daneben ein Knopf je Möglichkeit | <span class="ui">Buttons</span> |
| Taste (`button`) | ein Button mit dem Namen, der beim Antippen die Nachricht des Geräts schickt | – |

Was der Designer nicht setzen kann, steht ausgegraut im Menü, mit dem Grund, etwa «Not supported: the value template: arithmetic (/ 1000)». Das sind Geräte, deren Ankündigung Werte erst umrechnet oder Befehle aus Vorlagen zusammensetzt. Solche Werte bindest du von Hand, siehe [Topics](/designer/topics).

Eine Form, die dein Gerät nicht darstellen kann, ist im Dialog ausgegraut. Fährst du mit der Maus darüber, steht dort der Grund. Die Form <span class="ui">Number</span> zeigt den Wert als [Platzhalter](/objekte/anzeigen#platzhalter).

Jeder Baustein kommt als [Gruppe](/objekte/anordnen#gruppe) auf den Screen, der Text und die Anzeige oder der Schalter werden also gemeinsam verschoben. Willst du nur eines davon ändern, doppelklickst du hinein oder wählst es in der Objektliste. <kbd>Strg</kbd>+<kbd>U</kbd> löst die Gruppe auf. Das Gerät bekommt die Objekte ohnehin einzeln.

Alles Weitere, Farben, Grösse, die Beschriftung, änderst du danach in den Eigenschaften wie bei jedem anderen Objekt.

## Mehrere Teile

Lichter, Lüfter und Klimageräte bestehen aus mehreren Teilen. Ein Lüfter hat etwa einen Schalter (Power), eine Geschwindigkeit (Speed), Voreinstellungen (Preset), eine Drehrichtung (Direction) und das Schwenken (Oscillation). Der Dialog listet sie unter <span class="ui">Parts</span>, jeden mit einem Häkchen, und alle sind angehakt. Nimm das Häkchen weg, wo du einen Teil nicht brauchst. Neben jedem angehakten Teil wählst du seine Form, wenn es mehr als eine gibt. Ohne Häkchen lässt sich nichts einfügen.

Auf dem Screen steht oben das Icon mit dem Namen, darunter folgt jeder angehakte Teil auf einer eigenen Zeile, mit seinem Namen davor oder darüber, in der Reihenfolge des Dialogs. Die Zeilen teilen sich das Rechteck, das du aufziehst. Hakst du nur einen Teil an, setzt der Designer ihn wie einen einfachen Eintrag, unter dem Namen des Geräts.

## Was im Projekt landet

Neben den Objekten trägt der Designer die Topics ein, die der Baustein braucht. Du findest sie unter <span class="ui">Settings</span> › <span class="ui">Topics</span>:

- das Topic, aus dem er liest. Liegt der Wert in einer JSON-Nachricht, etwa `{"state":"ON"}`, ist es ein JSON-Topic mit dem Feld als Subtopic,
- das Topic, an das er seine Befehle schickt.

Als ersten Beispielwert bekommt jedes Topic, was beim Einfügen auf dem Broker lag. Die Vorschau zeigt so von Anfang an etwas, das nach deiner Anlage aussieht. Ein Topic, das schon im Projekt steht, lässt der Designer, wie es ist, auch wenn du seine Beispiele selbst eingetragen hast.
