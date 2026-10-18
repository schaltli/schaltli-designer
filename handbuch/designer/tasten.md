# Hardware-Tasten und Gesten

Was eine Taste am Gerät, ein Dreh am Ring oder eine Wischgeste auslöst, legst du im Designer fest, für jeden Screen einzeln.

## Eine Taste belegen

Die Tasten belegst du in den Eigenschaften des Screens, die rechts stehen, solange nichts ausgewählt ist. Unter <span class="ui">Hardware buttons</span> hat jede Taste des Geräts ihre eigene Auswahl, beim [Knob](/geraete/knob) die beiden Richtungen des Drehrings. Braucht eine Aktion noch etwas, etwa einen Screen oder einen Regler, erscheint das Feld gleich darunter.

<Screenshot narrow name="tasten-screen" alt="Unter Hardware buttons die Tasten Rotate Right und Rotate Left mit ihren Aktionen" caption="Der Drehring blättert durch die Screens." />

Die Tasten sind auch im Rahmen um den Screen eingezeichnet. Klickst du auf eine, springt die rechte Spalte zu ihrer Zeile und hebt sie kurz hervor.

<Screenshot name="taste-knob" alt="Der Knob im Designer; rechts in den Eigenschaften des Screens die Zeile der Taste Rotate Right" caption="Ein Klick auf den rechten Pfeil des Knobs führt zu Rotate Right." />

Zur Wahl stehen diese Aktionen:

| Aktion | was sie tut |
|---|---|
| <span class="ui">Nothing</span> | nichts, auch wenn der Master etwas vorgibt |
| <span class="ui">Next screen</span>, <span class="ui">Previous screen</span> | zum nächsten oder vorigen Screen blättern |
| <span class="ui">Go to a screen</span> | zu einem bestimmten Screen springen |
| <span class="ui">Go to the screen beside</span> | zum Screen, der darüber, darunter, links oder rechts liegt; welcher, wählst du unter <span class="ui">Side</span>. Liegt dort keiner, tut die Taste nichts |
| <span class="ui">Send an MQTT message</span> | eine Nachricht an ein Topic schicken, etwa einen Befehl |
| <span class="ui">Enter setup mode</span> | in die [Einrichtung](/geraete/einrichten) des Geräts wechseln |
| <span class="ui">Adjust a slider or dial</span> | einen Slider oder Dial um eine Stufe verstellen, siehe [unten](#regler) |
| <span class="ui">Open a popup</span> | ein [Popup](/designer/screens#popups) über den Screen legen; welches, wählst du unter <span class="ui">Popup</span> |
| <span class="ui">Close this popup</span> | das Popup schliessen; nur auf einem Popup zu haben |
| <span class="ui">Device Action</span> | etwas, das nur dieses Gerät kann, etwa an der 4.3B das Display ausschalten (<code>displayOff</code>) |

Ist eine Taste auf dem Master belegt, zeigt die Auswahl dessen Aktion als «Inherit» an. Der Screen übernimmt sie, bis du ihm eine eigene gibst. Ein Popup übernimmt nichts vom Master: Solange es offen ist, gilt nur seine eigene Belegung.

Ein farbiger Punkt vor der Auswahl und an den Tasten im Rahmen sagt, woher die Belegung kommt: grau heisst nicht belegt, gelb vom Master geerbt, rot auf diesem Screen belegt.

## Einen Regler stellen {#regler}

Mit <span class="ui">Adjust a slider or dial</span> stellt eine Taste einen Slider oder Dial auf dem Screen. Beim Knob ist das der Drehring: Jede Raste verschiebt den Regler um eine Stufe, und das Gerät schickt den neuen Wert auf dessen Write Topic. Die Anlage bekommt einen fertigen Wert wie `60` und muss kein «eins höher» verstehen.

- <span class="ui">Control</span>: welcher Regler. Zur Wahl stehen die Slider, Dials und Switcher des Screens, jeweils mit ihrem Topic. Auf einem Master sind es nur die Objekte des Masters.
- <span class="ui">Direction</span>: <span class="ui">One step up</span> oder <span class="ui">One step down</span>. Der Designer schlägt die Richtung nach dem Namen der Taste vor, beim Knob dreht <span class="ui fw">Rotate Left</span> hinunter.

Eine Stufe ist der Step des Reglers. Am Ende des Bereichs tut die Taste nichts mehr, sie springt nicht auf den Anfang zurück. Dasselbe gilt, solange der Regler noch keinen Wert kennt, etwa gleich nach dem Einschalten.

Wählst du einen Switcher, stellt die Taste den Regler im Panel, das der Switcher gerade zeigt. So bedient der Ring zum Beispiel bei einem Lüfter im Automatikbetrieb die Temperatur und im Handbetrieb die Geschwindigkeit. Zeigt das Panel keinen Regler, etwa wenn der Lüfter aus ist, passiert nichts.

Wird der Regler gelöscht, steht bei der Taste der Hinweis <span class="ui">Target missing</span>, und die Taste tut nichts, bis du einen anderen wählst.

## Wischgesten

Geräte mit Touch kennen vier Wischgesten. Du belegst sie in den Eigenschaften des Screens unter <span class="ui">Swipe navigation</span>: <span class="ui">Swipe left</span>, <span class="ui">Swipe right</span>, <span class="ui">Swipe up</span> und <span class="ui">Swipe down</span>. Jede hat dieselbe Auswahl wie eine Taste, gleich daneben.

Ohne eigene Belegung wischt ein Screen zu seinen Nachbarn, siehe [Screens über- und untereinander](/designer/screens#position). Was du auf dem Master belegst, gilt dort, wo in dieser Richtung kein Nachbar liegt. Willst du statt zu wischen Tasten drücken, legst du auf jede Taste <span class="ui">Go to the screen beside</span> mit einer anderen Richtung. Belegst du eine Wischgeste selbst, in deren Richtung ein Nachbar liegt, weist dich der Designer darauf hin, dass sie nicht mehr zu ihm führt.

Auf einem [Popup](/designer/screens#popups) gibt es keine Wischgesten zu belegen. Jede Wischgeste schliesst es.

## Das Screen-Menü gibt es nicht mehr {#screen-menue}

Früher hatten Knob und Android-App ein eigenes Screen-Menü, die Geräteaktion «Show Screen Menu». An seine Stelle tritt das Wischen zu den Nachbarn, siehe [Screens über- und untereinander](/designer/screens#position), und in der App der [Navigator](/objekte/anordnen#navigator). Öffnest du ein Projekt, das das Menü noch belegt, nimmt der Designer die Belegung heraus und meldet es einmal. Ein Gerät mit einem älteren Projekt öffnet das Menü weiter, bis du das Projekt neu überträgst.

## Ausprobieren

In der [Vorschau](/designer/vorschau) funktionieren die Tasten: Klick im Rahmen auf eine Taste, und der Designer führt ihre Aktion aus.
