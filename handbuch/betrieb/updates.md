# Updates und Versionen

## Den Designer aktualisieren

Auf einem Pekaway-System führst du einfach das [Installationsskript](/installieren/pekaway) noch einmal aus:

```bash
curl -fsSL https://raw.githubusercontent.com/Matthias-Hess/schaltli-designer/main/deploy/pekaway-install.sh | bash
```

Es holt den neuen Stand, baut ihn, lädt die dazu passende Firmware für die Geräte, bringt die VanPi-Brücke auf den neuen Stand und startet den Designer neu. Deine Projekte und Einstellungen bleiben erhalten.

Ohne Pekaway siehe [Ohne Pekaway](/installieren/ohne-pekaway#aktualisieren).

## Die Geräte aktualisieren

Jede Version des Designers bringt die Firmware mit, die zu ihr passt. Nach einem Update des Designers bietet er sie im Dialog <span class="ui">Deploy to Device</span> an, siehe [Firmware-Updates](/geraete/firmware-updates). Ein Gerät aktualisiert sich nie von selbst, immer nur auf deinen Klick.

Die Android-App aktualisierst du wie beim ersten Mal über ihre [Releases-Seite](/geraete/android#installieren).

## Welche Version läuft?

```bash
curl http://<IP-deines-Pekaway-Systems>:3000/api/version
```

Die Antwort nennt drei Dinge:

- **designer**: der Stand des Designers, etwa `fw-2026.09.18.1`. Steht dahinter noch etwas wie `-24-g457f1ad`, ist er 24 Änderungen weiter als dieses Release.
- **systemGeneration**: die Generation, die Designer und Firmware gemeinsam haben müssen, etwa `1.0`. Ändert sich die erste Zahl, braucht ein Gerät zuerst neue Firmware, bevor es neue Projekte annimmt.
- **firmware**: welche Firmware-Version dieser Designer für die Geräte mitbringt.

Dieselbe Zeile steht unten im Dialog <span class="ui">Deploy to Device</span>. Welche Firmware ein Gerät gerade hat, zeigt derselbe Dialog unter <span class="ui">Firmware</span>, sobald du das Gerät auswählst.

Stehen Designer und Firmware beide auf demselben Release, etwa `fw-2026.09.18.1`, passen sie zusammen.
