# Bausteine-Durchsicht (Starter-Film)

Begonnen 2026-11-11, nachdem der Nutzer die ersten Kapitel des Starter-Films
gesehen hat: Der «Schaltli-like» gebaute Starter wirkt teilweise hässlich, vor
allem die Schalter; dadurch schon Home. Die Bausteine werden einzeln
angeschaut. Zuerst der Designer, die Firmware zieht nach, wo es sie betrifft.

- Übersicht: Artifact «Starter-Bausteine» https://claude.ai/artifact/9aDauS98XLAU4MgnbpJDV1
  (Screenshots aus `docs/video/remotion/scripts/starterfilm/catalog.mjs`,
  Bilder unter `docs/video/remotion/public/starterfilm/catalog/`)
- Entwurf Schalter: Artifact «Schalter mit LED» https://claude.ai/artifact/QUAiujqMgPeaJqQzXidrbm

Die Neuaufnahme des Films ist angehalten, bis die Bausteine stehen.

## Schalter (Toggle Button)

Problem: Der heutige Toggle Button füllt die ganze Kachel, wenn an; das sieht
aus wie eine Taste, die eine Aktion auslöst. Die Button Group «Aus | An» braucht
zwei Zeilen und lässt «Aus» in der Akzentfarbe leuchten.

Entschieden (der Nutzer, 2026-11-11):

1. **Leuchtfenster nach Art der Cockpit-Tasten (Korry).** Die Kachel bleibt
   ruhig (Kartenfarbe, 1-px-Rand), der Name darauf; darunter ein Fenster, das
   bei an **flächig in der LED-Farbe leuchtet, das Wort darauf schwarz**. Aus:
   dunkles Fenster, das Wort schwach.
2. **Fenster eckig** (keine Rundung). Verworfen: das Fenster als Leuchtrahmen
   mit leuchtendem Wort auf dunklem Feld (B3), das gerundete Fenster, und die
   heute gefüllte Kachel (A, zu ähnlich einem Button).
   Im Entwurf bleiben drei Formen: **Korry** (dieses Fenster), **LED
   Horizontal** (Band unter dem Namen), **LED Vertikal** (Streifen links).
   **Alle drei sind als Stil des Toggle Buttons wählbar** (der Nutzer,
   2026-11-11).
3. **Kompakt:** wenig Innenabstand (Entwurf 8 × 10 px, kompakt 6 × 8 px),
   Name und Fenster eng beisammen, keine feste Kachelhöhe. Fenster 22 px hoch
   (kompakt 16 px), Wort 13 px (kompakt 10 px), Name 22 px.
4. **Gefragt, noch nicht bestätigt: Das Fenster pulsiert halb hell** in der
   LED-Farbe. Ein Zustand, keine Eigenschaft; ersetzt den Ring der Spec vom
   2026-11-06 (Entscheid 6). Wo ein Gerät nicht animieren kann (PaperS3),
   braucht es eine ruhige Form - offen.

5. **Die neuen Stile ersetzen «Filled» und «Tonal»** des Toggle Buttons.
   Bestehende Toggle Buttons (auch das Demo-Projekt «Camper») werden auf Korry
   umgestellt. (Switch und Button Group behalten ihre Stile.)
6. **LED-Farbe pro Schalter wählbar** (die bestehende Farbeigenschaft),
   Voreinstellung Accent - so geht Farbe nach Funktion (Wärme Warning, Wasser
   Accent, Abwasser Accent 3, Licht Good; Alarm bleibt Störungen).
7. **Schrift im Korry-Fenster automatisch** schwarz oder weiss nach der
   Tonregel, die der Designer für Schrift auf Akzentflächen schon hat.
8. **Im Starter werden alle Relais Toggle Buttons** (Home, Wasser, Ablassen,
   Schalter); die Prebuilt-Bausteine der VanPi-Brücke legen Toggle Buttons an.

Offen:

- Ruhige Form für «gefragt» auf Geräten, die nicht animieren (PaperS3).

## Wert-Karten (Temperatur, Batterie, Solar, Tank)

Entwurf: Artifact «Wert-Karten» https://claude.ai/artifact/UHHnM2JF1PBPVW4BQ9aJts

Kommen aus «Prebuilt» (`lib/bausteine.ts`, aus der Discovery der Brücke), als
freie Teile. Entschieden (der Nutzer, 2026-11-11):

1. **Die Karte bleibt eine Gruppe freier Teile**, kein neues Objekt; die neue
   Gestaltung entsteht im Baustein-Bauer (kleiner Name mit Icon, grosse Zahl,
   Farbe, Balken, Tankbreite - welche Einstellung, noch offen; Vorschlag im
   Entwurf: kleines einfarbiges Icon, Zahl gross in der Farbe ihrer Bedeutung,
   dünner Balken über die ganze Breite, Tank über beide Spalten).
2. **Verlauf der letzten 3 h als knappe Form des Charts** (ohne Achsen und
   Legende, festes Fenster): Sparkline neben der Zahl oder Fläche hinter der
   Karte. Im Designer zuerst; die Simulation braucht einen erfundenen Verlauf.
   Auf Geräten eine Obergrenze für aufgezeichnete Reihen.
3. **Kein Trendpfeil, keine Zusatzzeile.** Weitere Werte fügt man selbst in der
   Tabelle der Karte an.

## Dimmer

Entwurf: Artifact «Dimmer-Entwurf» https://claude.ai/artifact/48QC5Au6qYoFKC6dtc5cZ4

Entschieden (der Nutzer, 2026-11-11, ersetzt den ersten Entscheid vom selben
Tag):

1. **Die Brücke kündigt jeden Dimmer als `number` an**, 0-100 %, `mode:
   slider` - statt heute als `light` mit Power und Brightness. Der Dimmy kennt
   nur 0-100 (aus = 0); mehr braucht es nicht. Der Befehl `dimmer/<n>` nimmt
   eine Zahl schon heute.
   Folge in Home Assistant: keine Lichtkarte, nicht in «alle Lichter aus»,
   kein Zurück auf die letzte Helligkeit (`on_level`).
2. **Im Designer ist ein Dimmer ein Slider** wie bei CamperUI, nach der
   Regel unten: Name oben links, Helligkeit oben rechts, darunter der Slider
   mit Thumb. 0 heisst «Aus». Farbe Accent (über die
   Farbeigenschaft änderbar), keine Farbe «nach Helligkeit». Das kann der
   Baustein-Bauer für `number` schon - kein neuer Code im Designer ausser der
   Gestaltung.
3. **Ein `light` aus Home Assistant bleibt wie heute** (Power, Brightness).
   Weitere Licht-Teile (Farbtemperatur, Farbe, Effekt, Weiss) und das
   JSON-Schema (Zigbee2MQTT) braucht ein generischer Client später; nicht
   jetzt. Befund: heute fallen diese Teile weg, `schema: json` wird ganz
   abgelehnt (`lib/ha-discovery.ts`).
4. Damit entfallen «Switch + Slider», der rahmenlose Toggle Button und die
   Trennlinien der Tabelle. Verworfen bleiben Korry beim Dimmer, die Kachel
   als Slider, «nur vormerken».

## Regel für alle Bedienelemente in Kacheln

Entschieden (der Nutzer, 2026-11-11), nach Formen mit dem Namen links in der
Kachel (C) und als eigene Tabellenspalte (D), beide verworfen:

**Der Name steht in der Kachel, oben; darunter die Bedienung** - wie beim
Toggle Button (Name oben, Licht darunter).

- Toggle Button: Name oben, Korry-Fenster darunter.
- Button Group: Name oben, darunter die Felder (siehe unten).
- Slider: Name oben links, Wert oben rechts, darunter die Spur mit Thumb
  über die ganze Breite.

Bündig ohne Pflege: jede Kachel füllt ihre Zelle, im Innern gibt es keine
Namensspalte; Rand und Innenabstand kommen aus dem Theme.

## Button Group: neuer Stil

Entwurf im Artifact «Heizung und MaxxFan». Entschieden (der Nutzer,
2026-11-11): Die Leiste sieht aus wie der Toggle Button - Kachel in
Kartenfarbe mit 1-px-Rand, oben der Name, darunter die Felder, **zwischen den
Feldern senkrechte Trennlinien**, unter jedem Wort ein **LED-Streifen wie bei
LED Horizontal**: beim gewählten Feld leuchtet er (Accent), das Wort hell; die
anderen dunkel, das Wort gedämpft. Verworfen: die vertiefte Mulde mit
erhabenem Feld und Accent-Strich.

Ein dritter Stil neben Filled und Tonal (Name offen); Voreinstellung für
Button Groups aus Bausteinen. Ohne Name füllen die Felder die Kachel.

## Heizung und MaxxFan

Entwurf: Artifact «Heizung und MaxxFan» https://claude.ai/artifact/BS6eFtMnyLbnpjBXhgxgLF

Entschieden (der Nutzer, 2026-11-11): **Form B** für beide.

- **Heizung:** oben Korry «Heizung» (an/aus), daneben der Zustand; Button
  Group «Betrieb: Temperatur | Leistung | Lüften», blass solange aus; der Bogen
  immer da (Raumtemperatur gross, darunter Ziel oder Stufe, Zustand in
  Farbe); Verbrauch als ruhige Zeile mit Textknopf «Nullen». Kein Titel.
  Braucht in der Brücke einen Befehl «an» (zurück in die letzte Betriebsart).
- **MaxxFan:** Korry «Lüfter» (`maxxfan/power`, gibt es) und «Deckel»
  (pulsiert, solange er fährt) nebeneinander; Button Group «Betrieb: Hand |
  Auto»; Slider (Hand: Drehzahl, Auto: Zieltemperatur, aus: blass);
  Button Group «Luft: Rein | Raus». Kein Titel. Der Screen ist damit voll.
- Verworfen: Form A (vier Betriebsarten in einer Leiste - dort leuchtet bei
  aus der Streifen unter «Aus»).

## Energy diagram

Entwurf: Artifact «Energy diagram» https://claude.ai/artifact/QYc1ro6qSkjuaS8UjvGJJv

Befund: Das Objekt ist in Ordnung, der Starter baut es schlecht auf - Knoten
aufeinander (jeder neue an derselben Stelle), keine Icons, «Storage» und
«Consumers», kein Charge-Topic (kein Ladering). Entwurf mit drei Formen
desselben Objekts: A Flow quer, B Flow von oben (wie CamperUI), C Sankey.

Der Nutzer, 2026-11-11:

- «+ Add node» bleibt, wie es ist: Knoten verschiebt man ohnehin von Hand,
  im Film eine Kleinigkeit.
- Ein Baustein «Energie» aus der Brücke wäre nett. Geht über die eigenen
  Block-Beschreibungen (`schaltli/blocks/<id>/config`, kein HA-Entity):
  neue Teil-Art mit einer Liste Knoten (Rolle, Name, mdi-Icon, Topic,
  Charge-Topic, Farbrolle); der Designer legt daraus ein Energy diagram an,
  Knoten vorgesetzt. Ältere Designer überspringen die unbekannte Art.
  **Lassen wir** (der Nutzer, 2026-11-11).
- Form: **lassen wir offen**, jeder setzt seine Knoten selbst.
- **Umschalten Flow/Sankey** (der Nutzer, 2026-11-11): Heute (Demo «Camper»)
  eine Button Group, die ein Local topic schreibt, und ein Switcher mit
  **zwei** Diagrammen - Knoten doppelt, sieht schlecht aus. Neu: **das
  Diagramm trägt seinen Umschalter selbst** - zwei kleine Icons in einer
  Ecke (Linien = Flow, Bänder = Sankey), das aktive hell; ein Tipp auf ein
  Icon schaltet. Ein Diagramm, Knoten einmal, kein Topic, kein Switcher;
  der Modus gehört dem Objekt auf diesem Display (von selbst lokal).
  Tippfläche je Icon gross genug für den Finger (rund 44 px), auch wenn das
  Icon kleiner ist. Eigenschaft im Designer: Umschalter an/aus und welche
  Ecke; der Sankey hält die Ecke frei, im Flow setzt man die Knoten selbst
  daneben. Braucht Firmware (Tipp, Anzeige) - später. Die Demo wird auf ein
  Diagramm umgebaut.

## Chart

Entwurf: Artifact «Chart im Starter» https://claude.ai/artifact/2mJjZVrqDXYkAfC6G6ijJH

Entschieden (der Nutzer, 2026-11-11): **Form A** - das Chart allein in einer
Karte; Legende oben links mit dem Wert «jetzt» je Reihe gross, Datum klein
rechts, Achsen 14 px, Minimum/Maximum markiert, bei Leistung «heute … kWh»
(Annotation sum). Keine Wert-Karten, keine Zeitraum-Leiste darüber.

Vorschläge für den Designer (offen):

1. «Automatic» beginnt nur bei Leistung und % bei 0, sonst eng um die Werte
   (Temperaturen kleben heute oben).
2. Der Name einer Reihe kommt aus der Discovery, wo es einen gibt, nicht
   aus dem letzten Teil des Topics («power»).
3. Die Simulation erfindet einen Verlauf, solange der Recorder noch keinen
   hat («No history yet» bis zum ersten Deploy).

Zeitraum (der Nutzer, 2026-11-11): **24 h als «Time range» des Screens,
dazu Pinch** (in: breiter, out: schmaler; 1 h / 6 h / 24 h / 7 Tage - gibt
es, auch auf dem 4"). Weil Form A keine Leiste hat, zeigt das Chart oben
rechts den Zeitraum statt nur das Datum, z.B. «6 h bis jetzt» (offen: genaue
Wörter). Im Video zeigen: zwei Finger, aus dem Tag wird die Woche.

## Kamera (Popup «Ablassen»)

Entwurf: Artifact «Kamera im Starter» https://claude.ai/artifact/1ZqnVf6D5ELjmVRcBUAX3H

Entschieden (der Nutzer, 2026-11-11):

- **Form A:** Kamera und Abwassertank in einer Karte (Tank rechts, Zahl und
  senkrechter Balken), darunter nur das Abwasserventil - als **Button
  Group «Zu | Offen» im neuen Stil**, nicht als Korry (der Nutzer): der
  LED-Streifen leuchtet unter dem, was das Ventil meldet; nach einem Tipp
  pulsiert er unter dem Gewünschten, bis es gemeldet ist. Das Popup so hoch wie sein Inhalt.
- **Nur das Ventil:** Zum Ablassen braucht es die Abwasserpumpe nicht; sie
  kommt aus dem Popup (falls überhaupt, unter «Schalter»).
- **Kein Einrasten auf 4:3** im Designer: Das Objekt wird im Video einfach
  genau 320 × 240 gross gemacht (heute höher als das Bild, darum ein grauer
  Streifen).

## Kopfzeile (Master)

Entwurf: Artifact «Kopfzeile und Home» https://claude.ai/artifact/ML5b518x2fbVSKx2WCXgwq

Entschieden (der Nutzer, 2026-11-11): **Form B** - links Uhrzeit und Tag
(«18:31 Mi 11.11.»), rechts Zustands-Icons nur, wenn etwas los ist
(Flamme bei laufender Heizung, Stecker bei Landstrom), dann Innentemperatur
und Ladestand je mit kleinem Icon; eine feine Linie unter der Kopfzeile.

- **Uhr:** Schaltli hat keine. Die Brücke schreibt jede Minute Zeit und Tag
  auf ein Topic (etwa `schaltli/state/time`), ein Live-Text zeigt sie - kein
  neuer Code in Designer und Firmware.
- Home darunter im Entwurf aus den neuen Bausteinen (Korry, Wert-Karten mit
  Zahl in der Farbe ihrer Bedeutung); die Gestaltung der Wert-Karten ist
  damit noch nicht entschieden.

## Navigator (Master)

Entwurf: Artifact «Navigator im Starter» https://claude.ai/artifact/WpzJkXf5UHyYZsxcasQZfi

Entschieden (der Nutzer, 2026-11-11):

- **Form B:** der aktive Screen mit hellem Icon und einem LED-Streifen
  darunter, die anderen gedämpft - dieselbe Sprache wie Button Group und
  Schalter. Im Designer eine dritte Wahl unter «Background» (neben Card und
  Accent); braucht Firmware.
- **Theme-Schalter als Icon** (Mond/Sonne) wie die anderen Einträge, hinter
  einem feinen Trennstrich, statt der Pille; braucht Firmware.
- **7 Screens statt 8:** «Temperaturen» wird Verlaufsseite unter «Klima»
  (Wisch nach oben, Screen-Graph). Dann passen 8 Einträge × 60 px ohne
  Scrollen.

## Stand der Durchsicht

Alle Bausteine des Starters besprochen (2026-11-11). Bestätigt (der Nutzer,
2026-11-11):

- **Wert-Karten** wie auf Home im Entwurf «Kopfzeile und Home»: kleines Icon
  und Name, Zahl gross in der Farbe ihrer Bedeutung, dünner Balken über die
  ganze Breite; Tank (und Batterie) über beide Spalten, Name links und Zahl
  rechts in einer Zeile.
- Der neue Button-Group-Stil heisst **«LED»**.
- Die drei Chart-Vorschläge: Achse ab 0 nur bei Leistung und %; Name der
  Reihe aus der Discovery; die Simulation erfindet einen Verlauf.

Sammel-Artifact «Starter, alle Screens» https://claude.ai/artifact/2uk4m65eYdrYSvMq5VidX4
(alle Screens im neuen Look, mit Lücken-Liste). Entschieden (der Nutzer,
2026-11-11):

1. **Blass, solange aus → ausblenden mit dem Switcher** (gibt es; der
   Baustein-Bauer macht das für `shown_when` schon). Kein «Dimmed when»,
   kein Disabled - zu aufwändig für jetzt.
2. **Button-Stil «Text»** (kein Behälter) als vierter Stil, für «Nullen».
3. **Icon im Toggle Button:** das Icon des Zustands klein vor dem Namen, in
   allen drei LED-Stilen.
4. **Ausrichtung im Toggle Button fest:** Name links, Wort im
   Korry-Fenster mittig; keine Eigenschaft.
5. **Dimmer bei 0 «Aus»:** der Baustein-Bauer setzt die Regel im Live-Text
   des Kartenkopfs.

Bei der Umsetzung zu prüfen: Live-Texte über dem Dial (Teile übereinander
im Baustein); ob die Brücke den Deckel erst «offen» meldet, wenn er offen
ist (sonst pulsiert nichts); Popup hat festen Rahmen (80 %), «Ablassen»
füllt ihn oben.

Beim Schreiben der Specs zu klären: ruhige Form für «gefragt» auf Geräten
ohne Animation (PaperS3); Wörter für den Zeitraum oben rechts im Chart.

Nächster Schritt: Specs unter `docs/` und Umsetzung im Designer, dann die
Firmware; danach der Starter neu und der Film neu aufgenommen.
