# Bausteine

Bausteine sind fertige Elemente für die Anlage deines Vans. Du musst kein Topic kennen: Ein Baustein fragt den Broker, was es gibt, zeigt es mit den Namen, die dein Van dafür hat, und bindet sich selbst daran.

Die Werte kommen von der VanPi-Brücke, die das [Installationsskript](/installieren/pekaway) auf einem Pekaway-System einrichtet.

<Screenshot narrow name="baustein-menue" alt="Das Block-Menü mit Tank, Battery, Switch und Dimmer" />

## So geht's

1. Klick in der Werkzeugleiste auf <span class="ui">Block</span> und wähle einen Baustein.
2. Zieh auf dem Screen ein Rechteck auf.
3. Wähle im Dialog, wofür der Baustein sein soll, etwa welchen Tank.

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
| <span class="ui">Tank</span> | eine Füllstandsanzeige ([Bar](/objekte/anzeigen#bar)) mit dem Namen des Tanks | Füllstand in Prozent | – |
| <span class="ui">Battery</span> | eine Anzeige des Ladezustands | Ladezustand in Prozent | – |
| <span class="ui">Switch</span> | ein Text mit dem Namen und ein Schalter mit «Aus» und «An» | ob das Relais an ist | das Relais |
| <span class="ui">Dimmer</span> | ein Schieberegler in Schritten von 5 | die Helligkeit | die Helligkeit, 0 bis 100 |
| <span class="ui">Theme</span> | ein Text «Theme» und ein Schalter mit «Hell» und «Dunkel» | ob die Screens hell oder dunkel sind | alle Screens auf einmal |

Alles Weitere, Farben, Grösse, die Beschriftung, änderst du danach in den Eigenschaften wie bei jedem anderen Objekt.

## Theme

Der Baustein <span class="ui">Theme</span> schaltet nicht ein Gerät der Anlage, sondern die Screens selbst zwischen hell und dunkel, auf allen Displays zugleich. Er liest `schaltli/state/theme` und schickt seine Befehle an `schaltli/cmnd/theme`. Den Zustand legt die [VanPi-Brücke](/betrieb/vanpi-bruecke#hell-und-dunkel) auf den Broker. Steht der Schalter auf «Dunkel», trägt der Knopf einen Mond. Das Mond-Icon bringt der Baustein ins Projekt mit, einmal, auch wenn du ihn mehrmals einfügst.

Angeboten wird er nur für Farbdisplays. Der [PaperS3](/geraete/papers3) und E-Paper-Displays haben nur die helle Variante.

::: warning Die Geräte schalten noch nicht um
<!-- handbuch-macke #20: Geräte folgen schaltli/state/theme noch nicht -->
Der Schalter ändert den Zustand auf dem Broker, aber noch kein Gerät richtet sich danach. Knob, 4.3B und die Android-App zeigen weiterhin hell. Du kannst den Baustein schon einsetzen: Sobald die Geräte es können, schalten sie ohne Änderung am Projekt um.
:::

## Ohne Pekaway oder ohne Broker

Findet der Designer keinen Broker oder keine Werte, sagt er das im Dialog und bietet die üblichen Einträge an: Tank 1 bis 4, Relais 1 bis 8, Dimmer 1 bis 8. Die Beispielwerte sind dann die typischen aus der Liste oben, und als Name steht etwa «Tank 1». Auf dem Gerät zeigen die Bausteine erst etwas an, wenn jemand unter diesen Topics Werte veröffentlicht, siehe [Ohne Pekaway](/installieren/ohne-pekaway#was-anders-ist-als-auf-pekaway).

Ein Baustein, den dein Gerät nicht darstellen kann, ist im Menü ausgegraut.
