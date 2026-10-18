# Vorschau

In der Vorschau verhält sich der Screen wie auf dem Gerät: Schalter lassen sich antippen, Regler ziehen, Buttons wechseln den Screen oder öffnen ein Popup, die Tasten im Gerätrahmen lösen ihre Aktion aus. Du wechselst mit dem roten Schalter unter dem Gerät: <span class="ui">Preview</span> startet sie, <span class="ui">Designer</span> bringt dich zurück in den Editor.

Rechts steht die Liste <span class="ui">MQTT Topic Values</span> mit jedem Topic, das der Screen liest, und seinem Wert. Oben in der Liste wählst du, woher die Werte kommen: <span class="ui">Live</span> oder <span class="ui">Simulation</span>.

## Live

Beim Start verbindet sich die Vorschau mit dem Broker und zeigt, was dort wirklich ankommt. Auf einem Pekaway-System sind das die Werte deines Vans.

<Screenshot name="vorschau-live" alt="Die Live-Vorschau mit den echten Werten des Vans" />

Ein Topic, für das noch kein Wert da ist, bleibt leer, und das Objekt zeigt dann auch nichts, so wie später auf dem Gerät.

::: warning Live wird wirklich geschaltet
Was du in der Live-Vorschau antippst, geht als Befehl an den Broker. Ein Schalter an einem Relais schaltet das Licht im Van tatsächlich.
:::

Stellst du einen Regler, zeigt die Vorschau den gewünschten Wert als Markierung, bis die Anlage den neuen Stand meldet.

## Simulation {#simulation}

<span class="ui">Simulation</span> zeigt statt der echten Werte die Beispielwerte der Topics. Veröffentlicht wird nichts. Findet der Designer keinen Broker, schaltet er von selbst auf Simulation.

<Screenshot name="vorschau-simulation" alt="Die Vorschau im Simulationsmodus mit den Beispielwerten" />

In der Liste kannst du jeden Wert ändern, als käme er gerade vom Broker. So probierst du aus, wie der Screen bei leerem Tank oder voller Batterie aussieht.

Tippst du einen Schalter an, beantwortet die Simulation den Befehl. Für Schalter weiss sie selbst, welcher Zustand zu welchem Befehl gehört. Für andere Befehle legst du die Antwort beim Topic unter <span class="ui">Mock Responses</span> fest, siehe [MQTT-Topics](/designer/topics#topics-im-projekt).

## Wischen {#wischen}

Du wischst mit gedrückter Maustaste über den Screen, auf einem Touchscreen mit dem Finger, so wie auf dem Gerät. Liegt in dieser Richtung ein Nachbar, folgt dir der Screen, und der Nachbar schiebt sich herein. Der [Navigator](/objekte/anordnen#navigator) bleibt dabei stehen, nur der Bereich daneben bewegt sich. Lässt du nach etwa 40 Pixeln los, zeigt die Vorschau den Nachbarn. Lässt du früher los, springt der Screen zurück. Hat die Wischgeste eine eigene Aktion, etwa ein Popup, löst sie diese beim Loslassen aus. Über einem offenen Popup schliesst jede Wischgeste das Popup.

<Screenshot name="vorschau-wischen" alt="Die Vorschau mitten im Wischen: Energie oben halb hinausgeschoben, Verlauf kommt von unten herein" caption="Nach oben gewischt: «Energie» geht hinauf, «Verlauf» kommt von unten." />

Wo eine Wischgeste zu einem Nachbarn führt, steht am Rand ein kurzer Strich, die Lasche, wie auf dem Gerät. Neben einem Navigator steht sie am Rand des Bereichs, der sich bewegt. Alle paar Sekunden rückt sie kurz zur Mitte hin. Belegst du eine Wischgeste selbst, fehlt an diesem Rand die Lasche, siehe [Screens über- und untereinander](/designer/screens#position).

<Screenshot name="vorschau-lasche" alt="Der Screen Verlauf mit der Lasche oben in der Mitte und dem Pfeil zurück im Navigator" caption="«Verlauf» liegt unter «Energie»: Die Lasche oben zeigt, dass du nach unten zurückwischen kannst." />

Eine Geste gehört dem, worauf sie beginnt. Auf einem Regler stellst du den Wert, auf dem Navigator scrollst du ihn, und auf einem Button oder Schalter löst schon der Druck dessen Aktion aus. Auf dem PaperS3 folgt der Screen nicht dem Finger und die Lasche bewegt sich nicht, denn das Gerät zeichnet keine Bewegung.

## Gut zu wissen

- Ein [Popup](/designer/screens#popups) legt die Vorschau über den Screen und dunkelt den Rest ab. Ein Klick daneben oder auf das ✕ oben rechts am Fenster schliesst es. Startest du die Vorschau, während du ein Popup bearbeitest, liegt es offen über dem ersten Screen.
- Die Screen-Liste links wechselt in der Vorschau den angezeigten Screen. Welchen Screen du bearbeitest, ändert sich dadurch nicht.
- Aktionen, die nur ein Gerät ausführen kann, etwa in die Einrichtung wechseln, meldet die Vorschau nur.
- Bearbeiten kannst du in der Vorschau nichts. <kbd>Esc</kbd> beendet sie nicht, dafür gibt es <span class="ui">Designer</span> im roten Schalter.
