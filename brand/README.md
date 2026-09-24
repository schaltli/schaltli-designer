# Schaltli – Zeichen, Schriftzug, Auftritt

Alles hier ist aus einer Quelle erzeugt, damit Webseite, Favicon und
Geräte-Bitmaps nicht auseinanderlaufen. Wer etwas ändert, ändert es im
Generator und erzeugt neu – nicht in den Dateien selbst.

## Das Zeichen

Es ist kein erfundenes Symbol, sondern das eigene Bedienelement: dieselbe
Pille mit derselben Kugel, die `lib/switch-shape.ts` auf die Geräte zeichnet.
Wer eine Schaltli-Tafel bedient, hat das Logo unter dem Finger.

| Datei | wofür |
|---|---|
| `mark.svg` | das Hauptzeichen, liegend, für alles ab ~32 px |
| `icon.svg` | dasselbe, quadratisch gerahmt |
| `mark-small.svg` | satter gezeichnet, für 24 px und darunter |
| `mark-outline.svg` | Kontur, für helle Flächen und Druck |
| `icon-square.svg` | Vollton-Quadrat mit ausgespartem Zeichen – für App-Icons |

Die Kugel hat **Luft** zur Spur. Das ist kein Zufall: eine Kugel, die ihre
Spur ausfüllt, sitzt fest; eine mit Spiel könnte rollen. Das Standbild
verspricht damit die Bewegung, die `intro.js` dann einlöst.

Unter ~24 px zerfällt die runde Aussparung beim Rastern auf ein Bit zu einer
eckigen Kerbe. Deshalb `mark-small.svg`, deshalb für Icons das
Vollton-Quadrat: ein liegendes Zeichen füllt ein quadratisches Feld nie,
als Negativ im Vollton tut es das.

## Der Schriftzug

**Varela Round**, das letzte `i` durch die stehende Pille ersetzt – die Kugel
oben ist das Tüpfelchen. Dass die Pille dicker ist als die Schaftstriche der
Schrift, ist Absicht.

`wordmark.svg` und `wordmark-dark.svg` enthalten **echte Umrisse**, keine
`<text>`-Elemente: sie brauchen die Schrift nicht und sehen überall gleich aus.
Varela Round steht unter der SIL Open Font License, die das Umwandeln in
Pfade ausdrücklich erlaubt. Für Fliesstext daneben lädt man sie normal von
Google Fonts.

## Die Farben

Schaltli ist schwarz-weiss, dazu kommt eine einzige Signalfarbe.

| Rolle | Hell | Dunkel | wofür |
|---|---|---|---|
| Papier | `#ffffff` | `#111111` | Grund |
| Tinte | `#111111` | `#eeeeee` | Text, Zeichen, Linien |
| Grau | `#555555` | `#aaaaaa` | Nebentext |
| Grau hell | `#888888` | `#777777` | Beschriftungen, inaktive Schalter |
| Linie | `#eeeeee` | `#333333` | Haarlinien, Rahmen |
| **Signal** | `#ff6a13` | `#ff8a3d` | «an», «aktiv» – sonst nichts |

Jeder Grauton ist ein Vielfaches von `0x11`, also genau eine der 16 Stufen,
die das PaperS3 darstellt. Ein Grau dazwischen würde das Panel auf die
nächste Stufe runden, und Bildschirm und Gerät sähen nicht mehr gleich aus.

Die Signalfarbe bedeutet «an» und wird für nichts anderes gebraucht, weder
als Schmuck noch für Überschriften oder Text. Auf Weiss hat sie nur etwa
2,9:1 Kontrast, Schrift bleibt deshalb Tinte. Sie ist bewusst kein Rot, damit sie nicht mit
den Fehlermeldungen im Designer (`--destructive`) verwechselt wird, und
kein Grün, das nach «ok» aussieht.

In Farbe darf die Kugel im Zeichen orange sein. Sonst bleibt das Zeichen
schwarz.

Auf E-Paper gibt es keine Farbe. Auf dem PaperS3 wird Orange ein mittleres
Grau, auf dem 1-Bit-Panel verschwindet es ganz. Ob etwas an ist, muss
deshalb immer auch die Form zeigen, die Kugel rechts. Die Farbe kommt nur
dazu.

Für Diagramme gibt es die Palette als Profil `schaltli` des Plugins
[diagram-design](https://github.com/cathrynlavery/diagram-design). Die Datei
`.diagram-design` im Repo-Root wählt es aus, das Profil selbst liegt unter
`~/.diagram-design/profiles/`. `architektur.html` ist damit gezeichnet und
zeigt den Weg vom Designer über den Pi auf die Geräte.

## Die Geräte

`device/` enthält die Boot-Bilder in den echten Auflösungen der vier Boards:

- `splash-knob-360x360.png` – Waveshare Knob-Touch LCD 1.8
- `splash-4v3b-800x480.png` – Waveshare ESP32-S3-Touch-LCD-4.3B
- `splash-papers3-960x540.png` – M5Stack PaperS3, 4 Bit Graustufen
- `splash-epaper-400x300-1bit.png` – GDEY042T81, **auf ein Bit geschwellt**

Das E-Paper-Bild ist bereits schwarzweiss gerechnet, nicht bloss graustufig
gespeichert – was du siehst, ist was das Panel zeigt.

## Der Auftritt

`intro.html` zeigt ihn, `intro.js` liefert ihn, `glyphs.js` trägt die
Buchstabenumrisse. Keine Abhängigkeiten, keine Schriftlieferung.

```html
<script src="glyphs.js"></script>
<script src="intro.js"></script>
<script>schaltliIntro(document.getElementById("logo"), { scale: 1.5 })</script>
```

Optionen: `ink`, `knock` (für dunklen Grund), `scale`, `loop`, `onDone`.

Die Bewegung ist die des Kapsel-Spielzeugs: die Kugel rollt bis zum Anschlag,
die Pille kippt um die liegende Kugel herum um 90°, steigt an ihren Platz und
bremst dort ab – worauf die Kugel aus Trägheit weiterläuft und oben anschlägt.
Beim Rollen liegt die Pille waagrecht. Physikalisch müsste die Fläche geneigt
sein, damit die Kugel überhaupt anläuft; die ruhige Waagrechte ist das bessere
Bild, und das Zeichen geht vor der Mechanik.

`prefers-reduced-motion` wird respektiert: wer Bewegung abbestellt hat, sieht
sofort das Endbild. Und die Animation läuft **einmal**, nicht in Schleife –
ein Logo, das dauernd zappelt, wird nach zehn Sekunden zum Ärgernis. `loop`
gibt es trotzdem, für Ladezustände.

## Neu erzeugen

```
REGEN_BRAND=1 npx playwright test e2e/brand-generate.spec.ts
```

Der Generator wandelt `VarelaRound-Regular.ttf` über
[opentype.js](https://opentype.js.org/) in Pfade und schreibt daraus alle
SVGs, PNGs und `glyphs.js`. Ohne `REGEN_BRAND` bleibt er übersprungen, damit
ein gewöhnlicher Durchgang nicht ins Arbeitsverzeichnis schreibt.

Die Schrift liegt hier mit, samt `VarelaRound-OFL.txt` – so ist der Satz ohne
Netz reproduzierbar, und die Open Font License verlangt den Lizenztext
ohnehin bei jeder Weitergabe.

Bewacht wird das Ergebnis von `e2e/brand-assets.spec.ts`, das im normalen
Durchgang mitläuft: es prüft, dass jedes Stück da ist, dass die Schriftzüge
Umrisse statt `<text>` tragen, dass das E-Paper-Bild wirklich nur zwei Töne
hat, dass die Animation ohne Schriftlieferung durchläuft und am Ende die
Kugel oben stehen hat – und dass nichts bündig am Rand klebt.

## Warum überall Luft ist

Der `viewBox` hat auf allen vier Seiten `PAD` Einheiten Rand. Das ist keine
Kosmetik: ohne ihn liegt die Pille bündig an der rechten Kante, die
Kantenglättung schneidet sie an, und übrig bleibt eine Spalte mit halber
Deckkraft – eine graue Haarlinie rechts neben dem Schriftzug, im SVG wie auf
der Leinwand der Animation. Genau das war einmal da und ist jetzt
festgenagelt: `PAD = 0` lässt die Wächterprüfung mit `Received: 128`
scheitern.

## Ausgerollt

Diese Dateien liefen dem Namen einen Tag voraus. Seit dem 2026-09-23 ist er
überall angekommen: Repos, MQTT-Topics, Captive Portal, Gerätevertrag,
Android-Paket und die Installation auf dem Pi
(`docs/2026-09-23-schaltli-rename.md`).
