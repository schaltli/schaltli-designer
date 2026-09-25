# Was ist Schaltli?

Schaltli bringt die Werte deines Vans auf kleine Displays und lässt dich dort schalten: Füllstand des Frischwassertanks, Ladezustand der Batterie, Licht an und aus, Dimmer auf halb. Was auf einem Display zu sehen ist, gestaltest du selbst, im Browser, und schickst es per WLAN aufs Gerät.

## Die vier Teile

<figure>
<svg class="schaltli-diagram" viewBox="0 0 760 272" role="img" aria-labelledby="teile-titel teile-desc">
  <title id="teile-titel">Designer, Broker, VanPi-Brücke und Geräte, verbunden über MQTT</title>
  <desc id="teile-desc">Designer, VanPi-Brücke und Geräte tauschen alles über den MQTT-Broker auf dem Pekaway-System aus.</desc>
  <defs>
    <marker id="pfeil" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
      <path class="arrowhead" d="M0,0 L8,3 L0,6 z" />
    </marker>
  </defs>
  <path class="connector" d="M224,64 H244 Q252,64 252,72 V112 Q252,120 260,120 H280" marker-start="url(#pfeil)" marker-end="url(#pfeil)" />
  <path class="connector" d="M224,208 H244 Q252,208 252,200 V160 Q252,152 260,152 H280" marker-start="url(#pfeil)" marker-end="url(#pfeil)" />
  <path class="connector" d="M480,136 H536" marker-start="url(#pfeil)" marker-end="url(#pfeil)" />
  <rect class="node" x="24" y="24" width="200" height="80" rx="6" />
  <text class="name" x="124" y="54" text-anchor="middle">Designer</text>
  <text class="sub" x="124" y="74" text-anchor="middle">im Browser gestalten</text>
  <text class="tech" x="124" y="92" text-anchor="middle">Next.js :3000</text>
  <rect class="node" x="24" y="168" width="200" height="80" rx="6" />
  <text class="name" x="124" y="198" text-anchor="middle">VanPi-Brücke</text>
  <text class="sub" x="124" y="218" text-anchor="middle">Werte der Anlage</text>
  <text class="tech" x="124" y="236" text-anchor="middle">Node-RED</text>
  <rect class="node focal" x="280" y="96" width="200" height="80" rx="6" />
  <text class="name" x="380" y="126" text-anchor="middle">MQTT-Broker</text>
  <text class="sub" x="380" y="146" text-anchor="middle">verteilt Werte und Projekte</text>
  <text class="tech" x="380" y="164" text-anchor="middle">mosquitto</text>
  <rect class="node" x="536" y="96" width="200" height="80" rx="6" />
  <text class="name" x="636" y="126" text-anchor="middle">Geräte</text>
  <text class="sub" x="636" y="146" text-anchor="middle">zeigen an, schalten</text>
  <text class="tech" x="636" y="164" text-anchor="middle">ESP32 · Android</text>
</svg>
<figcaption>Alles läuft über den MQTT-Broker auf deinem Pekaway-System.</figcaption>
</figure>

**Der Designer** ist eine Web-Anwendung, die du auf deinem Pekaway-System installierst. Du öffnest ihn im Browser auf dem Laptop oder Tablet und baust dort deine Screens: eine Anzeige für den Tank hierhin, einen Schalter fürs Licht dorthin. Ein Projekt gehört immer zu einem bestimmten Gerätetyp, denn ein runder Screen mit 360 × 360 Pixeln braucht einen anderen Aufbau als ein breiter mit 800 × 480.

**Der MQTT-Broker** ist die Vermittlungsstelle. Auf jedem Pekaway-System läuft schon einer (Mosquitto). Die Anlage legt dort ihre Werte ab, die Geräte holen sie sich, und wer schaltet, schickt einen Befehl dorthin. Auch der Designer schickt fertige Projekte und neue Firmware über den Broker an die Geräte.

**Die VanPi-Brücke** übersetzt zwischen Pekaway und Schaltli. Sie läuft als Tab in Node-RED, fragt alle zwei Sekunden die Werte der Anlage ab und legt sie unter `schaltli/state/…` auf den Broker. Schaltbefehle unter `schaltli/cmnd/…` reicht sie an Pekaway weiter. Das Installationsskript richtet sie gleich mit ein.

**Die Geräte** zeigen deine Screens an und nehmen Berührungen entgegen:

| Gerät | Display | Bedienung |
|---|---|---|
| [Waveshare Knob-Touch LCD 1.8](/geraete/knob) | rund, 360 × 360, Farbe | Touch und Drehring |
| [Waveshare ESP32-S3-Touch-LCD-4.3B](/geraete/waveshare-4-3b) | 800 × 480, Farbe | Touch |
| [M5Stack PaperS3](/geraete/papers3) | E-Paper, 960 × 540, 16 Graustufen | Touch |
| Android-Handy oder -Tablet | was das Gerät hat | Touch |

Die drei Boards bespielst du einmal über USB mit der Schaltli-Firmware, danach kommen Projekte und Updates per WLAN. Auf dem Android-Gerät installierst du stattdessen die Schaltli-App.

## Ein altes Handy aus der Schublade

Das günstigste Schaltli-Display hast du vielleicht schon. Jedes Android-Handy oder -Tablet mit Android 8.0 oder neuer taugt dafür. Es hat einen Touchscreen in Farbe, der meist grösser und schärfer ist als die Displays der Boards, dazu WLAN und einen Akku, der kurze Stromausfälle überbrückt. Flashen musst du nichts, und löten auch nicht.

Die App macht aus dem Handy ein festes Bedienteil. Der Bildschirm bleibt an, die Leisten von Android verschwinden, und die App lässt sich nicht versehentlich verlassen. Das Handy meldet sich beim Broker selbst an und sagt dem Designer, wie gross sein Display ist. Im Designer erscheint es danach als eigenes Gerät, und du gestaltest Screens genau für diese Grösse. Hängt es an einem Ladekabel an der Wand, sieht man ihm sein früheres Leben kaum noch an.

So siehst du deinen Screen gleich auf einem echten Display im Van und entscheidest danach in Ruhe, ob du ein Board dafür willst.

Die App gibt es als Installationsdatei zum Herunterladen. Wie du sie aufs Handy bekommst und warum sie nicht im Play Store steht, erklärt die Seite [Android-App](/geraete/android).

## Was du brauchst

- Ein Pekaway-System (VanPi), auf dem du dich per SSH anmelden kannst. Ohne Pekaway geht es auch, dann fehlen aber die Werte der Anlage, siehe [Ohne Pekaway](/installieren/ohne-pekaway).
- Einen Computer mit Chrome oder Edge und ein USB-Kabel, um ein neues Board zum ersten Mal zu bespielen. Firefox, Safari und Handys können das nicht.
- Ein WLAN, in dem Pekaway-System und Geräte sich erreichen.
- Mindestens ein Gerät aus der Tabelle oben.

## Wie es weitergeht

1. [Installiere den Designer](/installieren/pekaway) auf deinem Pekaway-System.
2. Bespiele ein neues Board mit dem Flasher, siehe [Firmware flashen](/geraete/flashen).
3. Verbinde es mit deinem WLAN und dem Broker, siehe [WLAN und MQTT einrichten](/geraete/einrichten).

Oder folge den [Ersten Schritten](/einfuehrung/erste-schritte), die den ganzen Weg an einem Beispiel zeigen.

Noch kein Gerät? Dann fang [ohne Gerät an](/einfuehrung/ausprobieren): Der Designer zeigt dir in seiner Vorschau, wie dein Screen aussehen wird.
