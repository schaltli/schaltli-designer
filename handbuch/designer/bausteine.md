# Bausteine

Bausteine sind fertige Elemente für die Anlage deines Vans. Du musst kein Topic kennen: Ein Baustein fragt den Broker, was es gibt, zeigt es mit den Namen, die dein Van dafür hat, und bindet sich selbst daran.

Die Werte kommen von der VanPi-Brücke, die das [Installationsskript](/installieren/pekaway) auf einem Pekaway-System einrichtet.

<Screenshot narrow name="baustein-menue" alt="Das Block-Menü mit Tank, Battery, Switch und Dimmer" />

## So geht's

1. Klick in der Werkzeugleiste auf <span class="ui">Block</span> und wähle einen Baustein.
2. Zieh auf dem Screen ein Rechteck auf.
3. Wähle im Dialog, wofür der Baustein sein soll, etwa welchen Tank.
4. Prüf die Beschriftung unter <span class="ui">Label</span>, wähl unter <span class="ui">Look</span>, wie der Baustein aussehen soll, und unter <span class="ui">Label position</span>, ob die Beschriftung darüber (<span class="ui">Above</span>) oder links daneben (<span class="ui">Left</span>) steht.
5. Klick auf <span class="ui">Insert</span>. Mit <span class="ui">Back</span> kommst du zurück zur Auswahl.

Bei <span class="ui">Switch</span> und <span class="ui">Theme</span> legst du unter <span class="ui">States</span> fest, was die beiden Zustände anzeigen, etwa «Zu» und «Offen» statt «Aus» und «An». Ein leeres Feld behält den vorgegebenen Text. Beim <span class="ui">Dimmer</span> bestimmt <span class="ui">Step</span>, in welchen Schritten sich die Helligkeit einstellen lässt, vorgegeben sind 5.

Fügst du denselben Baustein noch einmal ein, schlägt der Dialog vor, was du beim letzten Mal gewählt hast: Form, Position der Beschriftung, Zustände und Schritte. Das gilt, bis du die Seite neu lädst.

<Screenshot narrow name="baustein-tank" alt="Der Dialog Insert Tank mit den Tanks des Vans" />

Die Schrift wählt der Designer passend zur Grösse des Screens.

## Was im Projekt landet

Neben den Objekten trägt der Designer die Topics ein, die der Baustein braucht. Du findest sie unter <span class="ui">Settings</span> › <span class="ui">Topics</span>:

- das Topic mit dem Wert, etwa dem Füllstand des Tanks,
- bei <span class="ui">Switch</span> und <span class="ui">Dimmer</span> das Topic, an das der Baustein seine Befehle schickt,
- bei <span class="ui">Tank</span>, <span class="ui">Switch</span> und <span class="ui">Dimmer</span> das Topic mit dem Namen, den dein Van dafür hat. Für die Batterie gibt es keinen.

Jedes Topic bekommt Beispielwerte, mit denen die Vorschau arbeitet. Vorne steht der Wert, den dein Van beim Einfügen gemeldet hat. Danach folgen typische Werte: beim Tank 72, 35 und 8 Prozent, bei der Batterie 87, 54 und 12, beim Dimmer 60, 25 und 100. Die Vorschau zeigt so von Anfang an etwas, das nach deinem Van aussieht. Ein Topic, das schon im Projekt steht, lässt der Designer, wie es ist, auch wenn du seine Beispiele selbst eingetragen hast.

## Die Bausteine

| Baustein | was entsteht | liest | schaltet |
|---|---|---|---|
| <span class="ui">Tank</span> | ein Text mit dem Namen des Tanks und darunter eine Füllstandsanzeige | Füllstand in Prozent | – |
| <span class="ui">Battery</span> | ein Text «Battery» und darunter eine Anzeige des Ladezustands | Ladezustand in Prozent | – |
| <span class="ui">Switch</span> | ein Text mit dem Namen und daneben ein Schalter mit «Aus» und «An» | ob das Relais an ist | das Relais |
| <span class="ui">Dimmer</span> | ein Text mit dem Namen und darunter ein Regler, vorgegeben in Schritten von 5 | die Helligkeit | die Helligkeit, 0 bis 100 |
| <span class="ui">Theme</span> | ein Text «Theme» und daneben ein Schalter mit «Hell» und «Dunkel» | ob die Screens hell oder dunkel sind | alle Screens auf einmal |

Unter <span class="ui">Look</span> stehen je nach Baustein diese Formen zur Wahl, die erste ist vorgewählt:

| Baustein | Formen |
|---|---|
| <span class="ui">Tank</span>, <span class="ui">Battery</span> | <span class="ui">Bar</span> ([Bar](/objekte/anzeigen#bar)), <span class="ui">Gauge</span> ([Gauge](/objekte/anzeigen#gauge)), <span class="ui">Number</span>: nur die Zahl, als Text mit `{topic:…:F0} %` |
| <span class="ui">Switch</span>, <span class="ui">Theme</span> | <span class="ui">Switch</span> ([Switch](/objekte/bedienen#switch)), <span class="ui">Buttons</span>: zwei Knöpfe nebeneinander, der zum Zustand passende leuchtet ([Button Group](/objekte/bedienen#button-group)) |
| <span class="ui">Dimmer</span> | <span class="ui">Slider</span> ([Slider](/objekte/bedienen#slider)), <span class="ui">Dial</span>: ein Drehregler ([Dial](/objekte/bedienen#dial)) |

Eine Form, die dein Gerät nicht darstellen kann, ist ausgegraut. Fährst du mit der Maus darüber, steht dort der Grund.

Jeder Baustein kommt als [Gruppe](/objekte/anordnen#gruppe) auf den Screen, der Text und die Anzeige oder der Schalter werden also gemeinsam verschoben. Willst du nur eines davon ändern, doppelklickst du hinein oder wählst es in der Objektliste. <kbd>Strg</kbd>+<kbd>U</kbd> löst die Gruppe auf. Das Gerät bekommt die Objekte ohnehin einzeln.

Die Beschriftung von <span class="ui">Tank</span>, <span class="ui">Switch</span> und <span class="ui">Dimmer</span> ist ein [Platzhalter](/objekte/anzeigen#platzhalter) auf das Namens-Topic, etwa `{topic:schaltli/state/tank/1/name ?? "Frischwasser"}`. Benennst du den Tank im Van um, steht auf dem Screen der neue Name. Bis der erste Name vom Van ankommt, zeigt das Gerät, was hinter `??` steht: den Namen, den der Designer beim Einfügen gefunden hat. Willst du einen festen Text, überschreibst du den Platzhalter schon im Dialog oder später in den Eigenschaften. <span class="ui">Battery</span> und <span class="ui">Theme</span> haben kein Namens-Topic, ihre Beschriftung ist fester Text.

Alles Weitere, Farben, Grösse, die Beschriftung, änderst du danach in den Eigenschaften wie bei jedem anderen Objekt.

## Theme

Der Baustein <span class="ui">Theme</span> schaltet nicht ein Gerät der Anlage, sondern die Screens selbst zwischen hell und dunkel, auf allen Displays zugleich. Er liest `schaltli/state/theme` und schickt seine Befehle an `schaltli/cmnd/theme`. Den Zustand legt die [VanPi-Brücke](/betrieb/vanpi-bruecke#hell-und-dunkel) auf den Broker. Steht der Schalter auf «Dunkel», trägt der Knopf einen Mond. Das Mond-Icon bringt der Baustein ins Projekt mit, einmal, auch wenn du ihn mehrmals einfügst.

Angeboten wird er nur für Farbdisplays. Der [PaperS3](/geraete/papers3) und E-Paper-Displays haben nur die helle Variante.

Knob, 4.3B und die Android-App schalten um, sobald der Zustand wechselt, mit einer Firmware oder App ab dem 26. September 2026. Ältere zeigen weiterhin hell.

## Ohne Pekaway oder ohne Broker

Findet der Designer keinen Broker oder keine Werte, sagt er das im Dialog und bietet die üblichen Einträge an: Tank 1 bis 4, Relais 1 bis 8, Dimmer 1 bis 8. Die Beispielwerte sind dann die typischen aus der Liste oben, und als Name steht etwa «Tank 1». Auf dem Gerät zeigen die Bausteine erst etwas an, wenn jemand unter diesen Topics Werte veröffentlicht, siehe [Ohne Pekaway](/installieren/ohne-pekaway#was-anders-ist-als-auf-pekaway).

Ein Baustein, den dein Gerät nicht darstellen kann, ist im Menü ausgegraut.
