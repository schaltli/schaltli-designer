# Updates und Versionen

## Den Designer aktualisieren

Auf einem Pekaway-System führst du einfach das [Installationsskript](/installieren/pekaway) noch einmal aus:

```bash
curl -fsSL https://raw.githubusercontent.com/schaltli/schaltli-designer/main/deploy/pekaway-install.sh | bash
```

Es holt die neueste offizielle Version, baut sie, lädt die dazu passende Firmware für die Geräte, bringt die VanPi-Brücke auf den neuen Stand und startet den Designer neu. Deine Projekte und Einstellungen bleiben erhalten. Designer und Firmware gehören dabei immer zur selben Version.

Während das Skript baut, läuft der Designer nicht. Unter seiner Adresse zeigt dann eine Seite, wie weit die Aktualisierung ist: die Version, den aktuellen Schritt und die letzten Zeilen des Protokolls. Sie lädt sich alle paar Sekunden neu. Ist der Designer wieder da, erscheint er an ihrer Stelle. Geht etwas schief, bleibt die Seite stehen und zeigt den Fehler. Das ganze Protokoll liegt in `~/.schaltli/install.log`.

Ohne Pekaway siehe [Ohne Pekaway](/installieren/ohne-pekaway#aktualisieren).

## Die Geräte aktualisieren

Jede Version des Designers bringt die Firmware mit, die zu ihr passt. Nach einem Update des Designers spielt <span class="ui">Deploy to Device</span> sie beim nächsten Übertragen zuerst auf, siehe [Firmware-Updates](/geraete/firmware-updates). Ein Gerät aktualisiert sich nie von selbst, immer nur auf deinen Klick.

Die Android-App aktualisierst du wie beim ersten Mal über ihre [Releases-Seite](/geraete/android#installieren).

## Neue Funktionen in älteren Projekten {#neue-funktionen}

Ein Projekt merkt sich, was sein Gerät konnte, als du es angelegt hast. Kann das Gerät nach einem Update mehr, etwa einen neuen Objekttyp, weiss ein älteres Projekt davon nichts. Der Designer sagt es dir, sobald du das Projekt öffnest: Über dem Screen steht ein Balken, zum Beispiel «"Waveshare ESP32-S3-Touch-LCD-4" can do more than this project knows. New: Navigator.» Ein Klick auf <span class="ui">Update device</span> gibt dem Projekt die neue Beschreibung des Geräts, und die neuen Objekttypen stehen in der [Palette](/designer/#palette). Speichere das Projekt, damit es dabei bleibt. Rückgängig nimmt den Schritt zurück.

Der Balken bleibt, solange das Projekt die ältere Beschreibung hat. Wegklicken lässt er sich nicht.

Die neue Beschreibung bringt entweder der Designer selbst mit, oder das Gerät meldet sie am Broker, wenn seine Firmware oder App neuer ist. Der Balken bietet sie nur an, wenn sie alles kann, was das Projekt schon kennt, und mehr. Läuft auf dem Gerät noch eine ältere Firmware, bietet er also keinen Schritt zurück an.

Damit das Gerät die neuen Objekte auch zeichnet, braucht es die passende Firmware. <span class="ui">Deploy to Device</span> spielt sie beim nächsten Übertragen mit auf, wie oben beschrieben.

## Eine Vorabversion ausprobieren

Meldest du ein Problem, bekommst du vielleicht eine Vorabversion, die es beheben soll: eine Version zum Ausprobieren, bevor sie für alle erscheint. Sie hat einen Namen wie `fw-2026.09.27.2-pre.knob_crash`, und du installierst genau diese:

```bash
curl -fsSL https://raw.githubusercontent.com/schaltli/schaltli-designer/main/deploy/pekaway-install.sh | bash -s -- --ref fw-2026.09.27.2-pre.knob_crash
```

Danach spielt <span class="ui">Deploy to Device</span> die Firmware dieser Vorabversion beim nächsten Übertragen mit auf, wie nach jedem Update. Deine Projekte und Einstellungen bleiben erhalten.

Zurück zur offiziellen Version kommst du mit dem gewöhnlichen Befehl von oben, ohne `--ref`. Die Firmware auf den Geräten bleibt dabei, wie sie ist. Die Vorabversion ist neuer als das Release davor, deshalb bietet der Designer dieses Release nicht als Update an, erst die nächste offizielle Version.

## Welche Version läuft?

```bash
curl http://<IP-deines-Pekaway-Systems>:3000/api/version
```

Die Antwort nennt drei Dinge:

- **designer**: der Stand des Designers, etwa `fw-2026.09.18.1`. Steht dahinter noch etwas wie `-24-g457f1ad`, ist er 24 Änderungen weiter als dieses Release. Steht `-pre.` im Namen, läuft eine Vorabversion.
- **systemGeneration**: die Generation, die Designer und Firmware gemeinsam haben müssen, etwa `1.0`. Ändert sich die erste Zahl, braucht ein Gerät zuerst neue Firmware, bevor es neue Projekte annimmt.
- **firmware**: welche Firmware-Version dieser Designer für die Geräte mitbringt.

Dieselbe Zeile steht unten im Dialog <span class="ui">Deploy to Device</span>. Welche Firmware ein Gerät gerade hat, zeigt derselbe Dialog in der Zeile unter der Geräteliste, sobald du das Gerät auswählst.

Stehen Designer und Firmware beide auf demselben Release, etwa `fw-2026.09.18.1`, passen sie zusammen.
