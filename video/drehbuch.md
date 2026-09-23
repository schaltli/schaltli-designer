# Schaltli-Vorstellung – Drehbuch (Entwurf 2)

Für das YouTube-Video, verlinkt im Pekaway-Forum. Sprache Deutsch, gelesen vom
Autor selbst. Ziel: etwa 2¼ Minuten, rund 300 Wörter.

Geändert gegenüber Entwurf 1: Die Herkunft im Forum ist raus – die gehört in
den Beitrag, nicht ins Video. Die Installation steht jetzt am Schluss, damit
die ersten Sekunden das Gerät zeigen und kein Terminal.

Quelle pro Szene:
- **Skript** – Playwright fährt den Designer, ffmpeg nimmt auf
- **Handy** – Clip der echten Hardware, filmst du
- **Bild** – Standbild oder Screenshot

---

## 1 · Aufhänger · Handy · ~10 s

**Bild:** Display an der Wand im Van. Ein Finger tippt auf „Licht“, das Licht
geht an.

> Das ist ein Touch-Display in meinem Van. Ich tippe drauf, und das Licht geht
> an. Programmiert habe ich dafür nichts – die Oberfläche ist zusammengeklickt.

## 2 · Was es ist · Skript · ~15 s

**Bild:** Designer im Browser mit einem fertigen Projekt: Seitenleiste mit
mehreren Seiten, eine Seite gross in der Mitte.

> Schaltli ist ein Designer für genau solche Anzeigen. Er läuft auf dem
> VanPi, man öffnet ihn im Browser, gestaltet seine eigenen Seiten und schickt
> sie per WLAN auf ein Display.

## 3 · Das Display meldet sich · Skript · ~12 s

**Bild:** Startbildschirm des Designers. Die Karte des gefundenen Displays
erscheint, wird ausgewählt, das leere Projekt öffnet sich in der richtigen
Grösse.

> Ein neues Display meldet sich von selbst. Bildschirmgrösse, Tasten und
> Schriften bringt es mit – von Hand eingetragen wird nichts.

## 4 · Gestalten · Skript · ~25 s

**Bild:** Datenfeld aufziehen, Topic „Batterie Ladestand“ wählen. Füllstand
aufziehen, Frischwasser wählen. Knopf aufziehen, Beschriftung „Licht“, Befehl
für das Licht wählen.

> Dann wird gestaltet. Ein Datenfeld für den Ladestand der Batterie. Eine
> Füllstandsanzeige für das Frischwasser. Ein Knopf für das Licht. Jedes
> Element bekommt sein MQTT-Topic aus einer Liste – alles, was der VanPi kennt,
> steht da schon drin.

## 5 · Live-Vorschau · Skript + Handy · ~20 s

**Bild:** Vorschau einschalten. Die Felder füllen sich mit echten Werten, rechts
steht „Live from …“. Klick auf den Knopf in der Vorschau. Schnitt aufs Handy:
Das Licht im Van geht an.

> In der Vorschau stehen keine Beispielwerte: Das sind die echten Werte aus
> meinem Van, in diesem Moment. Und der Knopf in der Vorschau schaltet
> wirklich.

## 6 · Aufs Display · Skript + Handy · ~15 s

**Bild:** Datei → Deploy to Device, Fortschritt bis fertig. Schnitt aufs Handy:
Das Display zeigt die neue Seite.

> Passt alles, geht die Seite per Deploy aufs Display. Kurz darauf ist sie da.

## 7 · Was noch geht · Skript + Handy · ~20 s

**Bild:** Kurze Folge von Einstellungen, je 3–4 Sekunden: Wischen zwischen
Seiten, Tabs und Schalter, die Displays und das Android-Telefon nebeneinander,
Firmware-Update im Deploy-Dialog, Versionsverlauf.

> Dazu mehrere Seiten mit Wischen, Tabs und Schalter. Unterstützt sind im
> Moment drei Displays und ein Android-Telefon. Firmware-Updates kommen direkt
> aus dem Designer, und jede Version eines Projekts bleibt erhalten.

## 8 · Grundsatz · Bild · ~12 s

**Bild:** Node-RED mit dem Lichtflow.

> Die Logik bleibt, wo sie hingehört: in Node-RED auf dem Pi. Das Display
> rechnet nichts – es zeigt Werte an und schickt Befehle, alles über MQTT. Wer
> keinen VanPi hat, sondern etwas anderes, das MQTT spricht, hängt das Display
> genauso an.

## 9 · Installation und Schluss · Skript/Bild · ~18 s

**Bild:** Terminal mit dem einen Installationsbefehl, danach Node-RED mit dem
Tab „Schaltli VanPi Bridge“ neben den Pekaway-Tabs. Zum Schluss das
Schaltli-Logo.

> Installiert wird das Ganze mit einem einzigen Befehl auf dem Pi. Die Flows
> von Pekaway bleiben unangetastet – es kommt nur ein eigener Tab dazu, der die
> Werte des VanPi für die Displays bereitstellt. Wie das geht und welche
> Displays passen, steht im Forum. Ich freue mich über jede Rückmeldung.

---

## Ton aufnehmen (du)

Eine Datei pro Szene, benannt `01.wav`, `02.wav` und so weiter. Am Anfang und
am Ende jeweils zwei Sekunden Stille. In einem ruhigen Raum, Mikrofon nah,
nicht ins Mikrofon atmen. Lieber eine Szene dreimal lesen und die beste Fassung
behalten – ich schneide nichts innerhalb einer Szene.

Aus den Längen deiner Dateien ergibt sich, wie lange jede Szene im Bild dauert.
Die Zeitangaben oben sind nur Schätzungen für den Umfang.

## Vor der Aufnahme fertig sein muss

- **Demo-Projekt** mit `schaltli/state/...`-Topics. „Camper Licht“ nutzt noch
  `pkw/tele/...`.
- **Aussagen prüfen:** „ein einziger Befehl“ (Szene 9), „kurz darauf“ (Szene 6)
  und die Liste der unterstützten Displays (Szene 7) müssen zum Zeitpunkt der
  Aufnahme stimmen.
- Live-Vorschau ist seit `cec0600` im Repo und auf dem Pi.

## Handy-Clips (du)

Querformat, ruhig halten, Display gut ausgeleuchtet. Jeweils ein paar Sekunden
Vor- und Nachlauf.

1. Tippen auf „Licht“, Licht geht an (Szenen 1 und 5)
2. Display zeigt nach dem Deploy die neue Seite (Szene 6)
3. Wischen zwischen Seiten am Display (Szene 7)
4. Alle Displays und das Telefon nebeneinander (Szene 7)
