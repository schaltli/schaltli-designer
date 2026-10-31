# Unterstützte Geräte

Schaltli läuft auf vier Boards und auf Android-Handys. Ein Projekt im Designer gehört immer zu einem dieser Geräte, denn Form, Grösse und Farbtiefe des Displays bestimmen, wie ein Screen aussehen kann. Hier derselbe kleine Screen, eine Tankanzeige und ein Lichtschalter, auf allen vier Boards:

<div class="schaltli-devices">
  <Screenshot name="geraet-waveshare-knob-1v8.webp" alt="Tankanzeige und Lichtschalter auf dem runden Knob" caption="Knob: rund, Farbe" />
  <Screenshot name="geraet-waveshare-touch-lcd-4v3b.webp" alt="Tankanzeige und Lichtschalter auf dem 4.3B" caption="4.3B: breit, Farbe" />
  <Screenshot name="geraet-waveshare-touch-lcd-4.webp" alt="Tankanzeige und Lichtschalter auf dem quadratischen 4-Zoll-Display" caption="4 Zoll: quadratisch, Farbe" />
  <Screenshot name="geraet-m5stack-papers3.webp" alt="Tankanzeige und Lichtschalter auf dem PaperS3 in Graustufen" caption="PaperS3: E-Paper, Graustufen" />
</div>

## Im Vergleich

| | [Waveshare Knob 1.8](/geraete/knob) | [Waveshare 4.3B](/geraete/waveshare-4-3b) | [Waveshare 4"](/geraete/waveshare-4) | [M5Stack PaperS3](/geraete/papers3) | [Android-App](/geraete/android) |
|---|---|---|---|---|---|
| Display | rund, 360 × 360 | 800 × 480 | quadratisch, 480 × 480 | E-Paper, 960 × 540 | wie das Handy |
| Farben | Farbe | Farbe | Farbe | 16 Graustufen | Farbe |
| Bedienung | Touch und Drehring | Touch | Touch | Touch | Touch |
| Strom | USB-C | 7–36 V direkt oder USB-C | 7–36 V direkt oder USB-C | USB-C | Ladekabel |
| Einrichten | [Flasher](/geraete/flashen), dann [WLAN und MQTT](/geraete/einrichten) | wie Knob | wie Knob | wie Knob | [App installieren](/geraete/android) |
| Firmware-Updates | [über den Designer](/geraete/firmware-updates) | über den Designer | über den Designer | über den Designer | neue APK |

Alle fünf können die Objekttypen des Designers darstellen, nur das [Chart](/objekte/anzeigen#chart) zeigt die Android-App noch nicht. Der runde Knob hat keinen [Navigator](/objekte/anordnen#navigator), und das PaperS3 zeigt das [Energy diagram](/objekte/anzeigen#energiediagramm) ohne Bewegung. Was ein Gerät nicht kann, blendet der Designer in der Werkzeugleiste aus.

## Das E-Paper-Display (nicht mehr unterstützt)

Das «MQTT ePaper Display (GDEY042T81)» mit 400 × 300 Pixeln in Schwarz-Weiss und zwölf Tasten war das erste Schaltli-Gerät. Seit Oktober 2026 wird es nicht mehr unterstützt. Ein Projekt, das du dafür gemacht hast, öffnet der Designer weiterhin, für ein neues Projekt bietet er es nicht mehr an. Für neue Einbauten nimm eines der Geräte oben.

## Ohne eigenes Gerät

Du kannst Screens für jedes dieser Geräte gestalten, ohne es zu besitzen, und sie in der Vorschau ausprobieren. Wie das geht, steht unter [Ohne Gerät ausprobieren](/einfuehrung/ausprobieren).
