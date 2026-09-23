# Hardware-Tasten und Gesten

Was eine Taste am Gerät, ein Dreh am Ring oder eine Wischgeste auslöst, legst du im Designer fest, für jeden Screen einzeln.

## Eine Taste belegen

Die Tasten eines Geräts sind im Rahmen um den Screen eingezeichnet. Klick auf eine, und rechts erscheint ihre Belegung. Beim [Knob](/geraete/knob) sind es die beiden Pfeile des Drehrings.

<Screenshot name="taste-knob" alt="Der Knob im Designer; rechts die Belegung der Taste Rotate Right" caption="Der rechte Dreh am Knob: unter Does steht, was er auslöst." />

Unter <span class="ui">Does</span> wählst du die Aktion:

| Aktion | was sie tut |
|---|---|
| <span class="ui">Nothing</span> | nichts, auch wenn der Master etwas vorgibt |
| <span class="ui">Next screen</span>, <span class="ui">Previous screen</span> | zum nächsten oder vorigen Screen blättern |
| <span class="ui">Go to a screen</span> | zu einem bestimmten Screen springen |
| <span class="ui">Send an MQTT message</span> | eine Nachricht an ein Topic schicken, etwa einen Befehl |
| <span class="ui">Enter setup mode</span> | in die [Einrichtung](/geraete/einrichten) des Geräts wechseln |
| <span class="ui">Device Action</span> | etwas, das nur dieses Gerät kann, etwa <span class="ui">Show Screen Menu</span> |

Ist eine Taste auf dem Master belegt, zeigt die Auswahl dessen Aktion als «Inherit» an. Der Screen übernimmt sie, bis du ihm eine eigene gibst.

Die Tasten im Rahmen haben einen farbigen Punkt: grau heisst nicht belegt, gelb vom Master geerbt, rot auf diesem Screen belegt.

## Wischgesten

Geräte mit Touch kennen vier Wischgesten. Du belegst sie in den Eigenschaften des Screens unter <span class="ui">Swipe navigation</span>: <span class="ui">Swipe left</span>, <span class="ui">Swipe right</span>, <span class="ui">Swipe up</span> und <span class="ui">Swipe down</span>. Ein Klick auf eine davon öffnet dieselbe Auswahl wie bei einer Taste.

Üblich ist, nach links und rechts zwischen den Screens zu blättern. Belegst du das auf dem Master, gilt es für alle Screens.

## Das Screen-Menü

Knob und Android-App haben ein eigenes Screen-Menü, das alle Screens zeigt. Du öffnest es über die Geräteaktion <span class="ui">Show Screen Menu</span>, zum Beispiel auf «nach oben wischen» gelegt. Das Menü zeigt die Icons der Screens, die du in den Screen-Eigenschaften wählst.

## Ausprobieren

In der [Vorschau](/designer/vorschau) funktionieren die Tasten: Klick im Rahmen auf eine Taste, und der Designer führt ihre Aktion aus.
