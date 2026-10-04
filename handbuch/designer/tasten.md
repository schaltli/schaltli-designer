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
| <span class="ui">Adjust a slider or dial</span> | einen Slider oder Dial um eine Stufe verstellen, siehe [unten](#regler) |
| <span class="ui">Device Action</span> | etwas, das nur dieses Gerät kann, etwa <span class="ui">Show Screen Menu</span> |

Ist eine Taste auf dem Master belegt, zeigt die Auswahl dessen Aktion als «Inherit» an. Der Screen übernimmt sie, bis du ihm eine eigene gibst.

Die Tasten im Rahmen haben einen farbigen Punkt: grau heisst nicht belegt, gelb vom Master geerbt, rot auf diesem Screen belegt.

## Einen Regler stellen {#regler}

Mit <span class="ui">Adjust a slider or dial</span> stellt eine Taste einen Slider oder Dial auf dem Screen. Beim Knob ist das der Drehring: Jede Raste verschiebt den Regler um eine Stufe, und das Gerät schickt den neuen Wert auf dessen Write Topic. Die Anlage bekommt einen fertigen Wert wie `60` und muss kein «eins höher» verstehen.

- <span class="ui">Control</span>: welcher Regler. Zur Wahl stehen die Slider, Dials und Switcher des Screens, jeweils mit ihrem Topic. Auf einem Master sind es nur die Objekte des Masters.
- <span class="ui">Direction</span>: <span class="ui">One step up</span> oder <span class="ui">One step down</span>. Der Designer schlägt die Richtung nach dem Namen der Taste vor, beim Knob dreht <span class="ui fw">Rotate Left</span> hinunter.

Eine Stufe ist der Step des Reglers. Am Ende des Bereichs tut die Taste nichts mehr, sie springt nicht auf den Anfang zurück. Dasselbe gilt, solange der Regler noch keinen Wert kennt, etwa gleich nach dem Einschalten.

Wählst du einen Switcher, stellt die Taste den Regler im Panel, das der Switcher gerade zeigt. So bedient der Ring zum Beispiel bei einem Lüfter im Automatikbetrieb die Temperatur und im Handbetrieb die Geschwindigkeit. Zeigt das Panel keinen Regler, etwa wenn der Lüfter aus ist, passiert nichts.

Wird der Regler gelöscht, steht unter <span class="ui">Does</span> der Hinweis <span class="ui">Target missing</span>, und die Taste tut nichts, bis du einen anderen wählst.

## Wischgesten

Geräte mit Touch kennen vier Wischgesten. Du belegst sie in den Eigenschaften des Screens unter <span class="ui">Swipe navigation</span>: <span class="ui">Swipe left</span>, <span class="ui">Swipe right</span>, <span class="ui">Swipe up</span> und <span class="ui">Swipe down</span>. Ein Klick auf eine davon öffnet dieselbe Auswahl wie bei einer Taste.

Üblich ist, nach links und rechts zwischen den Screens zu blättern. Belegst du das auf dem Master, gilt es für alle Screens.

## Das Screen-Menü

Knob und Android-App haben ein eigenes Screen-Menü, das alle Screens zeigt. Du öffnest es über die Geräteaktion <span class="ui">Show Screen Menu</span>, zum Beispiel auf «nach oben wischen» gelegt. Das Menü zeigt die Icons der Screens, die du in den Screen-Eigenschaften wählst.

## Ausprobieren

In der [Vorschau](/designer/vorschau) funktionieren die Tasten: Klick im Rahmen auf eine Taste, und der Designer führt ihre Aktion aus.
