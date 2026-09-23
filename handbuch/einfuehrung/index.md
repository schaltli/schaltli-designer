# Was ist Schaltli?

Schaltli bringt die Werte deines Vans auf kleine Displays und lässt dich dort schalten: Füllstand des Frischwassertanks, Ladezustand der Batterie, Licht an und aus, Dimmer auf halb. Was auf einem Display zu sehen ist, gestaltest du selbst, im Browser, und schickst es per WLAN aufs Gerät.

## Die vier Teile

<figure>
<svg class="schaltli-diagram" viewBox="0 0 720 250" role="img" aria-labelledby="teile-titel">
  <title id="teile-titel">Designer, Broker, VanPi-Brücke und Geräte, verbunden über MQTT</title>
  <defs>
    <marker id="pfeil" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
    </marker>
  </defs>
  <g fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="20" y="20" width="200" height="80" rx="10" />
    <rect x="260" y="85" width="200" height="80" rx="10" />
    <rect x="20" y="150" width="200" height="80" rx="10" />
    <rect x="500" y="85" width="200" height="80" rx="10" />
    <line x1="220" y1="75" x2="258" y2="105" marker-end="url(#pfeil)" marker-start="url(#pfeil)" />
    <line x1="220" y1="175" x2="258" y2="145" marker-end="url(#pfeil)" marker-start="url(#pfeil)" />
    <line x1="460" y1="125" x2="498" y2="125" marker-end="url(#pfeil)" marker-start="url(#pfeil)" />
  </g>
  <g fill="currentColor" font-size="15" text-anchor="middle">
    <text x="120" y="55" font-weight="600">Designer</text>
    <text x="120" y="78" font-size="13">im Browser gestalten</text>
    <text x="360" y="120" font-weight="600">MQTT-Broker</text>
    <text x="360" y="143" font-size="13">verteilt Werte und Projekte</text>
    <text x="120" y="185" font-weight="600">VanPi-Brücke</text>
    <text x="120" y="208" font-size="13">Werte der Anlage</text>
    <text x="600" y="120" font-weight="600">Geräte</text>
    <text x="600" y="143" font-size="13">zeigen an, schalten</text>
  </g>
</svg>
<figcaption>Alles läuft über den MQTT-Broker auf deinem Pekaway-System.</figcaption>
</figure>

**Der Designer** ist eine Web-Anwendung, die du auf deinem Pekaway-System installierst. Du öffnest ihn im Browser auf dem Laptop oder Tablet und baust dort deine Screens: eine Anzeige für den Tank hierhin, einen Schalter fürs Licht dorthin. Ein Projekt gehört immer zu einem bestimmten Gerätetyp, denn ein runder Screen mit 360 × 360 Pixeln braucht einen anderen Aufbau als ein breiter mit 800 × 480.

**Der MQTT-Broker** ist die Vermittlungsstelle. Auf jedem Pekaway-System läuft schon einer (Mosquitto). Die Anlage legt dort ihre Werte ab, die Geräte holen sie sich, und wer schaltet, schickt einen Befehl dorthin. Auch der Designer schickt fertige Projekte und neue Firmware über den Broker an die Geräte.

**Die VanPi-Brücke** übersetzt zwischen Pekaway und Schaltli. Sie läuft als Tab in Node-RED, fragt alle zwei Sekunden die Werte der Anlage ab und legt sie unter `schaltli/state/…` auf den Broker. Schaltbefehle unter `schaltli/cmnd/…` reicht sie an Pekaway weiter. Das Installationsskript richtet sie gleich mit ein.

**Die Geräte** zeigen deine Screens an und nehmen Berührungen entgegen:

| Gerät | Display | Bedienung |
|---|---|---|
| Waveshare Knob-Touch LCD 1.8 | rund, 360 × 360, Farbe | Touch und Drehring |
| Waveshare ESP32-S3-Touch-LCD-4.3B | 800 × 480, Farbe | Touch |
| M5Stack PaperS3 | E-Paper, 960 × 540, 16 Graustufen | Touch |
| Android-Handy oder -Tablet | was das Gerät hat | Touch |

Die drei Boards bespielst du einmal über USB mit der Schaltli-Firmware, danach kommen Projekte und Updates per WLAN. Auf dem Android-Gerät installierst du stattdessen die Schaltli-App.

## Ein altes Handy aus der Schublade

Das günstigste Schaltli-Display hast du vielleicht schon. Jedes Android-Handy oder -Tablet mit Android 8.0 oder neuer taugt dafür. Es hat einen Touchscreen in Farbe, der meist grösser und schärfer ist als die Displays der Boards, dazu WLAN und einen Akku, der kurze Stromausfälle überbrückt. Flashen musst du nichts, und löten auch nicht.

Die App macht aus dem Handy ein festes Bedienteil. Der Bildschirm bleibt an, die Leisten von Android verschwinden, und die App lässt sich nicht versehentlich verlassen. Das Handy meldet sich beim Broker selbst an und sagt dem Designer, wie gross sein Display ist. Im Designer erscheint es danach als eigenes Gerät, und du gestaltest Screens genau für diese Grösse. Hängt es an einem Ladekabel an der Wand, sieht man ihm sein früheres Leben kaum noch an.

So siehst du deinen Screen gleich auf einem echten Display im Van und entscheidest danach in Ruhe, ob du ein Board dafür willst.

::: warning Die App gibt es noch nicht zum Herunterladen
<!-- handbuch-macke #12: keine APK veröffentlicht -->
Die Schaltli-App ist noch nicht veröffentlicht. Sobald es sie zum Herunterladen gibt, steht hier, wo.
:::

## Was du brauchst

- Ein Pekaway-System (VanPi), auf dem du dich per SSH anmelden kannst. Ohne Pekaway geht es auch, dann fehlen aber die Werte der Anlage, siehe [Ohne Pekaway](/installieren/ohne-pekaway).
- Einen Computer mit Chrome oder Edge und ein USB-Kabel, um ein neues Board zum ersten Mal zu bespielen. Firefox, Safari und Handys können das nicht.
- Ein WLAN, in dem Pekaway-System und Geräte sich erreichen.
- Mindestens ein Gerät aus der Tabelle oben.

## Wie es weitergeht

1. [Installiere den Designer](/installieren/pekaway) auf deinem Pekaway-System.
2. Bespiele ein neues Board mit dem <a href="/schaltli-designer/flasher/" target="_self">Flasher</a>.
3. Verbinde es mit deinem WLAN und dem Broker. Das Board zeigt dafür nach dem Flashen einen QR-Code.

Noch kein Gerät? Dann fang [ohne Gerät an](/einfuehrung/ausprobieren): Der Designer zeigt dir in seiner Vorschau, wie dein Screen aussehen wird.
