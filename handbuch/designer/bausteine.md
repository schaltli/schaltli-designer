# Bausteine

Bausteine sind fertige Elemente für die Anlage deines Vans. Du musst kein Topic kennen: Ein Baustein fragt den Broker, was es gibt, zeigt es mit den Namen, die dein Van dafür hat, und bindet sich selbst daran.

Die Werte kommen von der VanPi-Brücke, die das [Installationsskript](/installieren/pekaway) auf einem Pekaway-System einrichtet.

<Screenshot narrow name="baustein-menue" alt="Das Block-Menü mit Tank, Battery, Switch und Dimmer" />

## So geht's

1. Klick in der Werkzeugleiste auf <span class="ui">Block</span> und wähle einen Baustein.
2. Zieh auf dem Screen ein Rechteck auf.
3. Wähle im Dialog, wofür der Baustein sein soll, etwa welchen Tank.

<Screenshot narrow name="baustein-tank" alt="Der Dialog Insert Tank mit den Tanks des Vans" />

Die Topics, die der Baustein braucht, trägt der Designer ins Projekt ein. Die Schrift wählt er passend zur Grösse des Screens.

## Die Bausteine

| Baustein | was entsteht | liest | schaltet |
|---|---|---|---|
| <span class="ui">Tank</span> | eine Füllstandsanzeige ([Bar](/objekte/anzeigen#bar)) mit dem Namen des Tanks | Füllstand in Prozent | – |
| <span class="ui">Battery</span> | eine Anzeige des Ladezustands | Ladezustand in Prozent | – |
| <span class="ui">Switch</span> | ein Text mit dem Namen und ein Schalter mit «Aus» und «An» | ob das Relais an ist | das Relais |
| <span class="ui">Dimmer</span> | ein Schieberegler in Schritten von 5 | die Helligkeit | die Helligkeit, 0 bis 100 |

Alles Weitere, Farben, Grösse, die Beschriftung, änderst du danach in den Eigenschaften wie bei jedem anderen Objekt.

## Ohne Pekaway oder ohne Broker

Findet der Designer keinen Broker oder keine Werte, sagt er das im Dialog und bietet die üblichen Einträge an: Tank 1 bis 4, Relais 1 bis 8, Dimmer 1 bis 8. Die Bausteine zeigen dann erst etwas an, wenn jemand unter diesen Topics Werte veröffentlicht, siehe [Ohne Pekaway](/installieren/ohne-pekaway#was-anders-ist-als-auf-pekaway).

Ein Baustein, den dein Gerät nicht darstellen kann, ist im Menü ausgegraut.
