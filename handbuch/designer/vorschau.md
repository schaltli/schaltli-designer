# Vorschau

In der Vorschau verhält sich der Screen wie auf dem Gerät: Schalter lassen sich antippen, Regler ziehen, Buttons wechseln den Screen, die Tasten im Gerätrahmen lösen ihre Aktion aus. Du startest sie oben rechts mit <span class="ui">Preview</span> und verlässt sie mit <span class="ui">Exit Preview</span>.

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

## Gut zu wissen

- Die Screen-Liste links wechselt in der Vorschau den angezeigten Screen. Welchen Screen du bearbeitest, ändert sich dadurch nicht.
- Aktionen, die nur ein Gerät ausführen kann, etwa in die Einrichtung wechseln, meldet die Vorschau nur.
- Bearbeiten kannst du in der Vorschau nichts. <kbd>Esc</kbd> beendet sie nicht, dafür gibt es <span class="ui">Exit Preview</span>.
