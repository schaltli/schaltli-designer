# MQTT an drei Beispielen

Was auf einem Display steht und was ein Finger dort schaltet, läuft über den MQTT-Broker. Diese Seite zeigt an drei Beispielen, welche Nachricht wohin geht und was sie bedeutet. Jedes Beispiel baut auf dem vorigen auf.

In den Bildern stehen links die Anlage, in der Mitte der Broker mit seinen Topics und rechts die Displays. Ein Topic ist ein Name, unter dem eine Nachricht auf dem Broker liegt oder durch ihn hindurchgeht. Die Anlage ist hier Pekaway, dessen Werte die [VanPi-Brücke](/betrieb/vanpi-bruecke) auf den Broker legt.

## 1. Der Wassertank: ein Wert, der liegen bleibt {#tank}

<figure>
<svg class="schaltli-diagram" viewBox="0 0 760 196" role="img" aria-labelledby="tank-title tank-desc">
  <title id="tank-title">Wassertank: ein Topic, das liegen bleibt</title>
  <desc id="tank-desc">Pekaway legt den Füllstand 63 unter schaltli/state/tank/1/level auf den Broker. Er bleibt dort liegen: Display A bekommt ihn sofort, Display B, das erst später eingeschaltet wird, bekommt ihn beim Einschalten.</desc>
  <defs>
    <marker id="tank-pfeil" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="8" markerHeight="6" orient="auto">
      <path class="arrowhead" d="M0,0 L8,3 L0,6 z" />
    </marker>
  </defs>
  <text class="eyebrow" x="16" y="14">ANLAGE</text>
  <text class="eyebrow" x="260" y="14">BROKER</text>
  <text class="eyebrow" x="560" y="14">DISPLAYS</text>
  <path class="connector" d="M200,104 H260" marker-end="url(#tank-pfeil)" />
  <path class="connector" d="M500,88 H522 Q530,88 530,80 V72 Q530,64 538,64 H560" marker-end="url(#tank-pfeil)" />
  <path class="connector" d="M500,120 H522 Q530,120 530,128 V144 Q530,152 538,152 H560" marker-end="url(#tank-pfeil)" />
  <rect class="node" x="16" y="72" width="184" height="64" rx="6" />
  <text class="name" x="108" y="91" text-anchor="middle">Pekaway</text>
  <text class="sub" x="108" y="110" text-anchor="middle">über die VanPi-Brücke</text>
  <text class="sub" x="108" y="129" text-anchor="middle">misst den Tank</text>
  <rect class="topic focal" x="260" y="56" width="240" height="96" rx="6" />
  <g class="tag"><rect x="272" y="66" width="88" height="15" rx="2" /><text x="316" y="77" text-anchor="middle">BLEIBT LIEGEN</text></g>
  <text class="topic-name" x="272" y="102">schaltli/state/tank/1/level</text>
  <text class="value" x="272" y="136">63</text>
  <text class="sub" x="488" y="136" text-anchor="end">Füllstand in %</text>
  <rect class="node" x="560" y="32" width="184" height="64" rx="6" />
  <text class="name" x="652" y="60" text-anchor="middle">Display A</text>
  <text class="sub" x="652" y="79" text-anchor="middle">zeigt 63 %</text>
  <rect class="node later" x="560" y="120" width="184" height="64" rx="6" />
  <text class="name" x="652" y="139" text-anchor="middle">Display B</text>
  <text class="sub" x="652" y="158" text-anchor="middle">später eingeschaltet:</text>
  <text class="sub" x="652" y="177" text-anchor="middle">bekommt sofort 63</text>
</svg>
<figcaption>Pekaway legt den Füllstand ab, jedes Display holt ihn sich, auch eines, das erst später einschaltet.</figcaption>
</figure>

Der einfachste Fall hat genau ein Topic: `schaltli/state/tank/1/level`. Pekaway misst den Tank, und die Brücke schickt den Füllstand als Zahl an dieses Topic, zum Beispiel `63`. Ein Display, das den Tank zeigt, liest dieses Topic und stellt den Balken auf 63 %. Es selbst schickt nichts.

Die Brücke fragt Pekaway alle zwei Sekunden. Nur wenn der Füllstand sich geändert hat, schickt sie eine neue Nachricht, und bei einem Tank ändert sich oft lange nichts.

Deshalb schickt sie den Wert **retained**: Der Broker behält die letzte Nachricht und gibt sie jedem, der sich neu für das Topic meldet. In den Bildern steht dafür «bleibt liegen». Schaltest du Display B erst am Abend ein, bekommt es die 63 sofort und muss nicht warten, bis im Tank wieder etwas passiert. Ohne retained bliebe sein Balken leer, bis zur nächsten Änderung.

Alle Werte unter `schaltli/state/…` bleiben so liegen. Die Liste steht unter [VanPi-Brücke](/betrieb/vanpi-bruecke#die-werte).

## 2. Der Dimmer: Zustand und Befehl {#dimmer}

<figure>
<svg class="schaltli-diagram" viewBox="0 0 760 300" role="img" aria-labelledby="dimmer-title dimmer-desc">
  <title id="dimmer-title">Dimmer: ein Zustand, ein Befehl, zwei Displays</title>
  <desc id="dimmer-desc">Display A schickt 40 an schaltli/cmnd/dimmer/1. Die Brücke stellt den Dimmer, liest den neuen Stand und legt 40 unter schaltli/state/dimmer/1/level ab. Display A und Display B bekommen beide die neue Helligkeit.</desc>
  <defs>
    <marker id="dimmer-pfeil" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="8" markerHeight="6" orient="auto">
      <path class="arrowhead" d="M0,0 L8,3 L0,6 z" />
    </marker>
  </defs>
  <text class="eyebrow" x="16" y="14">ANLAGE</text>
  <text class="eyebrow" x="260" y="14">BROKER</text>
  <text class="eyebrow" x="560" y="14">DISPLAYS</text>
  <path class="connector command" d="M560,216 H538 Q530,216 530,224 V232 Q530,240 522,240 H500" marker-end="url(#dimmer-pfeil)" />
  <path class="connector command" d="M260,240 H238 Q230,240 230,232 V216 Q230,208 222,208 H200" marker-end="url(#dimmer-pfeil)" />
  <path class="connector" d="M200,136 H222 Q230,136 230,128 V112 Q230,104 238,104 H260" marker-end="url(#dimmer-pfeil)" />
  <path class="connector" d="M500,88 H522 Q530,88 530,80 V80 Q530,72 538,72 H560" marker-end="url(#dimmer-pfeil)" />
  <path class="connector" d="M500,120 H522 Q530,120 530,128 V168 Q530,176 538,176 H560" marker-end="url(#dimmer-pfeil)" />
  <rect class="node" x="16" y="112" width="184" height="120" rx="6" />
  <text class="name" x="108" y="159" text-anchor="middle">Pekaway</text>
  <text class="sub" x="108" y="178" text-anchor="middle">über die VanPi-Brücke</text>
  <text class="sub" x="108" y="197" text-anchor="middle">Dimmer 1</text>
  <rect class="topic" x="260" y="56" width="240" height="96" rx="6" />
  <g class="tag"><rect x="272" y="66" width="88" height="15" rx="2" /><text x="316" y="77" text-anchor="middle">BLEIBT LIEGEN</text></g>
  <text class="topic-name" x="272" y="102">schaltli/state/dimmer/1/level</text>
  <text class="value" x="272" y="136">40</text>
  <text class="sub" x="488" y="136" text-anchor="end">Helligkeit</text>
  <rect class="topic command focal" x="260" y="192" width="240" height="96" rx="6" />
  <g class="tag"><rect x="272" y="202" width="72" height="15" rx="2" /><text x="308" y="213" text-anchor="middle">GEHT DURCH</text></g>
  <text class="topic-name" x="272" y="238">schaltli/cmnd/dimmer/1</text>
  <text class="value" x="272" y="272">40</text>
  <text class="sub" x="488" y="272" text-anchor="end">neue Helligkeit</text>
  <rect class="node" x="560" y="40" width="184" height="64" rx="6" />
  <text class="name" x="652" y="59" text-anchor="middle">Display B</text>
  <text class="sub" x="652" y="78" text-anchor="middle">zeigt 40</text>
  <text class="sub" x="652" y="97" text-anchor="middle">liest nur</text>
  <rect class="node" x="560" y="152" width="184" height="88" rx="6" />
  <text class="name" x="652" y="183" text-anchor="middle">Display A</text>
  <text class="sub" x="652" y="202" text-anchor="middle">Finger stellt 40</text>
  <text class="sub" x="652" y="221" text-anchor="middle">schreibt und liest</text>
  <g class="step"><circle cx="515" cy="222" r="9" /><text x="515" y="226" text-anchor="middle">1</text></g>
  <g class="step"><circle cx="245" cy="222" r="9" /><text x="245" y="226" text-anchor="middle">2</text></g>
  <g class="step"><circle cx="245" cy="120" r="9" /><text x="245" y="124" text-anchor="middle">3</text></g>
  <g class="step"><circle cx="515" cy="104" r="9" /><text x="515" y="108" text-anchor="middle">4</text></g>
</svg>
<figcaption>Display A schickt einen Befehl, die Anlage meldet den neuen Zustand, und beide Displays zeigen ihn.</figcaption>
</figure>

Einen Dimmer willst du auch stellen können. Dafür gibt es zwei Topics:

- `schaltli/state/dimmer/1/level` ist der **Zustand**: wie hell das Licht gerade ist. Er kommt von der Anlage und bleibt liegen wie beim Tank.
- `schaltli/cmnd/dimmer/1` ist der **Befehl**: wie hell es werden soll. Er kommt von einem Display.

Die Nummern im Bild zeigen, was passiert, wenn du auf Display A den Regler auf 40 ziehst:

1. Display A schickt `40` an den Befehl `schaltli/cmnd/dimmer/1`.
2. Die Brücke liest den Befehl und stellt den Dimmer bei Pekaway.
3. Kurz danach fragt sie Pekaway nach dem neuen Stand und legt `40` unter `schaltli/state/dimmer/1/level` ab.
4. Beide Displays lesen dieses Topic und zeigen 40, auch Display B, an dem niemand etwas getan hat.

Ein Display zeigt also, was die Anlage meldet. Klappt ein Befehl nicht, sieht man das. Und wer den Dimmer an Display B oder in Pekaway selbst verstellt, verstellt ihn auch auf Display A. Das Topic für den Zustand ist die eine Stelle, an der der Stand gilt.

### Warum ein Befehl nicht liegen bleiben darf {#befehl-nicht-retained}

Ein Befehl geht einmal durch und ist weg, im Bild «geht durch». Bliebe er liegen, bekäme ihn die Brücke jedes Mal wieder, wenn sie sich neu mit dem Broker verbindet, etwa nach einem Neustart des Pekaway-Systems. Sie würde ihn dann noch einmal ausführen: Der Dimmer stünde wieder auf 40, auch wenn du ihn inzwischen auf 0 gestellt hast, und das Licht ginge womöglich mitten in der Nacht an.

Die Displays schicken ihre Befehle nie retained. Schreibst du selbst Befehle, etwa aus Node-RED oder mit `mosquitto_pub`, lass es ebenfalls weg.

### Im Designer

Der Baustein <span class="ui">Dimmer</span> verdrahtet beides selbst. Bei einem Slider von Hand trägst du den Zustand unter <span class="ui">Topic</span> ein und den Befehl unter <span class="ui">Write topic</span>, siehe [Slider](/objekte/bedienen#slider). Für einen Schalter gilt dasselbe mit <span class="ui">Read topic</span> und <span class="ui">Write topic</span>, siehe [Switch](/objekte/bedienen#switch).

## 3. Die Heizung: Soll und Ist {#heizung}

<figure>
<svg class="schaltli-diagram" viewBox="0 0 760 392" role="img" aria-labelledby="heizung-title heizung-desc">
  <title id="heizung-title">Heizung: Ist, Soll und ein Befehl</title>
  <desc id="heizung-desc">Pekaway legt die gemessene Temperatur 17 unter schaltli/state/heater/temp und die Solltemperatur 21 unter schaltli/state/heater/target ab. Das Display zeigt beides auf einem Ring und schickt eine neue Solltemperatur an schaltli/cmnd/heater/target.</desc>
  <defs>
    <marker id="heizung-pfeil" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="8" markerHeight="6" orient="auto">
      <path class="arrowhead" d="M0,0 L8,3 L0,6 z" />
    </marker>
  </defs>
  <text class="eyebrow" x="16" y="14">ANLAGE</text>
  <text class="eyebrow" x="260" y="14">BROKER</text>
  <text class="eyebrow" x="560" y="14">DISPLAYS</text>
  <path class="connector" d="M200,152 H222 Q230,152 230,144 V88 Q230,80 238,80 H260" marker-end="url(#heizung-pfeil)" />
  <path class="connector" d="M200,200 H260" marker-end="url(#heizung-pfeil)" />
  <path class="connector command" d="M260,320 H246 Q238,320 238,312 V256 Q238,248 230,248 H200" marker-end="url(#heizung-pfeil)" />
  <path class="connector" d="M500,80 H522 Q530,80 530,88 V152 Q530,160 538,160 H560" marker-end="url(#heizung-pfeil)" />
  <path class="connector" d="M500,200 H560" marker-end="url(#heizung-pfeil)" />
  <path class="connector command" d="M560,240 H546 Q538,240 538,248 V312 Q538,320 530,320 H500" marker-end="url(#heizung-pfeil)" />
  <rect class="node" x="16" y="120" width="184" height="160" rx="6" />
  <text class="name" x="108" y="187" text-anchor="middle">Pekaway</text>
  <text class="sub" x="108" y="206" text-anchor="middle">über die VanPi-Brücke</text>
  <text class="sub" x="108" y="225" text-anchor="middle">Heizung</text>
  <rect class="topic" x="260" y="32" width="240" height="96" rx="6" />
  <g class="tag"><rect x="272" y="42" width="88" height="15" rx="2" /><text x="316" y="53" text-anchor="middle">BLEIBT LIEGEN</text></g>
  <text class="topic-name" x="272" y="78">schaltli/state/heater/temp</text>
  <text class="value" x="272" y="112">17</text>
  <text class="sub" x="488" y="112" text-anchor="end">Ist in °C</text>
  <rect class="topic focal" x="260" y="152" width="240" height="96" rx="6" />
  <g class="tag"><rect x="272" y="162" width="88" height="15" rx="2" /><text x="316" y="173" text-anchor="middle">BLEIBT LIEGEN</text></g>
  <text class="topic-name" x="272" y="198">schaltli/state/heater/target</text>
  <text class="value" x="272" y="232">21</text>
  <text class="sub" x="488" y="232" text-anchor="end">Soll in °C</text>
  <rect class="topic command" x="260" y="272" width="240" height="96" rx="6" />
  <g class="tag"><rect x="272" y="282" width="72" height="15" rx="2" /><text x="308" y="293" text-anchor="middle">GEHT DURCH</text></g>
  <text class="topic-name" x="272" y="318">schaltli/cmnd/heater/target</text>
  <text class="value" x="272" y="352">21</text>
  <text class="sub" x="488" y="352" text-anchor="end">neues Soll</text>
  <rect class="node" x="560" y="128" width="184" height="144" rx="6" />
  <text class="name" x="652" y="154" text-anchor="middle">Display</text>
  <path class="track" d="M632.2,217.8 A28,28 0 1 1 671.8,217.8" />
  <path class="fill" d="M632.2,217.8 A28,28 0 0 1 624.8,191.4" />
  <circle class="marker" cx="638.3" cy="173.6" r="6" />
  <text class="value" x="652" y="206" text-anchor="middle" style="font-size:17px">17°</text>
  <text class="sub" x="652" y="258" text-anchor="middle">Ring 17 °C, Marke 21 °C</text>
</svg>
<figcaption>Die Heizung braucht drei Topics: was gemessen wird, was eingestellt ist, und den Befehl, der das Eingestellte ändert.</figcaption>
</figure>

Beim Dimmer ist der gewünschte Wert eine Sekunde später auch der tatsächliche. Bei einer Heizung nicht: Stellst du 21 °C ein, ist es im Van noch lange 17 °C. Eingestellter und gemessener Wert sind verschiedene Dinge, und beide will man sehen. Deshalb kommt ein drittes Topic dazu:

- `schaltli/state/heater/temp` ist das **Ist**: die gemessene Temperatur, `17`. Es kommt von der Heizung und bleibt liegen.
- `schaltli/state/heater/target` ist das **Soll**: die eingestellte Temperatur, `21`. Auch das meldet die Anlage, und auch das bleibt liegen.
- `schaltli/cmnd/heater/target` ist der **Befehl**, der das Soll ändert, 12 bis 35. Er geht durch wie beim Dimmer.

Der Befehl ändert also nicht die Temperatur, sondern das Soll. Die Anlage meldet das neue Soll zurück, genau wie beim Dimmer. Das Ist folgt irgendwann von selbst, wenn die Heizung ihre Arbeit tut.

Ein- und ausschalten ist davon getrennt: `schaltli/cmnd/heater` mit `on` oder `off`, gemeldet unter `schaltli/state/heater/power`.

### Im Designer

Am besten zeigt ein [Dial](/objekte/bedienen#dial) beides: Der Ring ist bis zum Ist gefüllt, eine Marke steht beim Soll, und der Finger verschiebt die Marke. Einen Baustein für die Heizung gibt es nicht, du verdrahtest den Dial selbst:

| Eigenschaft | Topic |
|---|---|
| <span class="ui">Topic</span> | `schaltli/state/heater/temp` |
| <span class="ui">Setpoint topic</span> | `schaltli/state/heater/target` |
| <span class="ui">Write topic</span> | `schaltli/cmnd/heater/target` |

Mit <span class="ui">Calibration</span> legst du fest, dass der Ring bei 12 °C leer und bei 35 °C voll ist.

## Selbst mithören

Auf dem Pekaway-System siehst du genau diese Nachrichten, während sie passieren:

```bash
mosquitto_sub -h localhost -t 'schaltli/state/dimmer/#' -t 'schaltli/cmnd/dimmer/#' -v
```

Zieh auf einem Display den Dimmer: Zuerst erscheint die Zeile mit `cmnd`, kurz danach die mit `state`. Beendest du `mosquitto_sub` mit Ctrl+C und startest es neu, stehen die `state`-Zeilen sofort wieder da, weil sie liegen geblieben sind. Die `cmnd`-Zeilen fehlen, denn Befehle bleiben nicht liegen.

Einen Befehl kannst du auch von Hand schicken:

```bash
mosquitto_pub -h localhost -t 'schaltli/cmnd/dimmer/1' -m 40
```

Mehr zum Broker und zu allen Topics steht unter [MQTT-Broker und Topics](/betrieb/mqtt).
