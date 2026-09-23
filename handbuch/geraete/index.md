# Unterstützte Geräte

Schaltli läuft auf drei Boards und auf Android-Handys. Ein Projekt im Designer gehört immer zu einem dieser Geräte, denn Form, Grösse und Farbtiefe des Displays bestimmen, wie ein Screen aussehen kann. Hier derselbe kleine Screen, eine Tankanzeige und ein Lichtschalter, auf allen drei Boards:

<div class="schaltli-devices">
  <Screenshot name="geraet-waveshare-knob-1v8" alt="Tankanzeige und Lichtschalter auf dem runden Knob" caption="Knob: rund, Farbe" />
  <Screenshot name="geraet-waveshare-touch-lcd-4v3b" alt="Tankanzeige und Lichtschalter auf dem 4.3B" caption="4.3B: breit, Farbe" />
  <Screenshot name="geraet-m5stack-papers3" alt="Tankanzeige und Lichtschalter auf dem PaperS3 in Graustufen" caption="PaperS3: E-Paper, Graustufen" />
</div>

## Im Vergleich

| | [Waveshare Knob 1.8](/geraete/knob) | [Waveshare 4.3B](/geraete/waveshare-4-3b) | [M5Stack PaperS3](/geraete/papers3) | [Android-App](/geraete/android) |
|---|---|---|---|---|
| Display | rund, 360 × 360 | 800 × 480 | E-Paper, 960 × 540 | wie das Handy |
| Farben | Farbe | Farbe | 16 Graustufen | Farbe |
| Bedienung | Touch und Drehring | Touch | Touch | Touch |
| Strom | USB-C | 7–36 V direkt oder USB-C | USB-C | Ladekabel |
| Einrichten | [Flasher](/geraete/flashen), dann [WLAN und MQTT](/geraete/einrichten) | wie Knob | wie Knob | [App installieren](/geraete/android) |
| Firmware-Updates | [über den Designer](/geraete/firmware-updates) | über den Designer | über den Designer | neue APK |

Alle vier können sämtliche Objekttypen des Designers darstellen. Welche das sind, zeigt der Designer selbst: Er blendet in der Werkzeugleiste aus, was ein Gerät nicht kann.

## Das E-Paper-Display (läuft aus)

Das «MQTT ePaper Display (GDEY042T81)» mit 400 × 300 Pixeln in Schwarz-Weiss und zwölf Tasten war das erste Schaltli-Gerät. Es läuft aus: Es bekommt keine Updates über den Designer mehr und lässt sich nur noch per USB bespielen. Für neue Einbauten nimm eines der Geräte oben. Wer eines hat, kann es im Designer weiterhin als Gerät wählen.

## Ohne eigenes Gerät

Du kannst Screens für jedes dieser Geräte gestalten, ohne es zu besitzen, und sie in der Vorschau ausprobieren. Wie das geht, steht unter [Ohne Gerät ausprobieren](/einfuehrung/ausprobieren).
