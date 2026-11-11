# Starterfilm: wie das Bild entsteht

Stand 2026-11-11. Ton: fertig, 21 Kapitel je zwei Takes, `docs/video/remotion/public/vo-st/K<n>-a.mp3`
und `-b.mp3` (Flow «Schaltli Starter-Video Voiceover», BUtkSgsphl34fcwzUjwN, Session-IDs in
`sessions.json`), zusammen 22 min (Take a). Text: `docs/video/starter-sprechtext.md`,
gesprochene Fassung `docs/video/remotion/starter-vo.json`.

## Aufnahme

- **Nicht über den Bildschirm.** Der Tab der Chrome-Erweiterung liegt im Fenster des Nutzers hinter
  anderen Tabs; gdigrab sieht nur, was vorne ist. Stattdessen ein eigenes Playwright-Skript pro Kapitel
  (`docs/video/remotion/scripts/starterfilm/K<n>.mjs`) mit `recordVideo` 1920×1080 gegen den Designer im
  Van (`http://192.168.8.107:3000`), Vorbild `scripts/designer-shot.mjs`.
- **Ein sichtbarer Mauszeiger** per `addInitScript` (Punkt, der `mousemove` folgt, Klick-Ring), sonst
  sieht man im Video nicht, was passiert.
- Langsam bewegen (`mouse.move` mit vielen `steps`, Pausen), damit man folgen kann.
- Nie neben `test:quick` laufen lassen (CPU, Port 3000 ist hier der Van, nicht der Dev-Server).
- Das 4" erst in Kapitel 19: Bildschirm des Geräts über `/panel.bmp` (HIL-Testschnittstelle, Passwort
  in `.env.local`) als Bildfolge, oder Vorschau des Designers.
- Geräteliste im Dialog «New Project» (Kapitel 1): Herstellernamen nicht abfilmen (Memory
  video-voiceover-elevenlabs) - Liste unscharf oder nur den Eintrag des 4" zeigen.

## Schnitt

- Pro Kapitel Video + Ton (`K<n>-a.mp3`): Ist das Video kürzer, letztes Bild halten oder langsamer;
  länger, schneller (`setpts`). Ton und Bild sind nur lose gekoppelt.
- Zwischentitel mit dem Kapitelnamen am Anfang jedes Kapitels (2 s).
- Zusammensetzen mit ffmpeg concat; die Kapitelmarken für YouTube aus den Längen
  (`0:00 Intro`, …), dazu die Beschreibung mit Forums-Thread, Handbuch, demo.schaltli.com, GitHub.

## Was im Van vorher laufen muss

- Neue Brücke (shore_*, booster_*, solar_power) und Tab «Schaltli Quellen»: einspielen ist Sache des
  Nutzers (Auto-Modus blockiert es als Produktiv-Deploy):
  `node scripts/install-vanpi-bridge.js --node-red http://192.168.8.107:1880 --broker mqtt://192.168.8.107:1883 --verify`
  und das Skript `install-quellen.js` (`tasks/install-quellen.js`).
- Dummy-Kamera: http://192.168.8.107:8090/shot.jpg (überlebt keinen Neustart des Pi).
- Das 4" im Camper-Netz: `node hil/boards-network.js camper`.

## Offen

- Bau per echter Bedienung oder Zwischenstände per API laden und nur die Kernhandgriffe filmen
  (Entscheid des Nutzers).
