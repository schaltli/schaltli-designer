# Firmware-Updates

Ist ein Board einmal eingerichtet, kommt neue Firmware per WLAN, über den Designer. Ein Kabel brauchst du dafür nicht mehr.

Jede Version des Designers bringt die Firmware mit, die zu ihr passt. Das [Installationsskript](/installieren/pekaway) lädt sie bei jedem Update mit herunter, und der Designer gibt sie den Boards im lokalen Netz weiter. Die Boards brauchen dafür keinen Internetzugang.

## So geht's

1. Öffne <span class="ui">File</span> › <span class="ui">Deploy to Device</span> und wähle das Board.
2. Unter <span class="ui">Firmware</span> steht, welche Version das Board hat (<span class="ui">Running</span>) und welche der Designer mitbringt (<span class="ui">Release</span>). Ist die mitgebrachte neuer, steht in der Geräteliste <span class="ui">firmware update</span> und hier <span class="ui">A newer firmware is available.</span>
3. Klick auf <span class="ui">Update firmware</span> und bestätige mit <span class="ui">Install firmware</span>.

Das Board lädt die Firmware, prüft sie und startet neu. Der Dialog zeigt jeden Schritt. Auf dem Board steht währenddessen «Firmware-Update / bitte nicht ausschalten».

Geht dabei etwas schief, bricht das Board ab und läuft mit seiner bisherigen Firmware weiter. Es schreibt die neue in einen zweiten Speicherbereich und wechselt erst, wenn sie vollständig und geprüft ist.

Ein Board, das gerade nicht erreichbar ist, holt das Update nach, sobald es wieder online ist.

## Eine Datei aufspielen

<span class="ui">From file...</span> spielt eine Firmware-Datei von deinem Computer auf, etwa eine Testversion. Der Designer prüft vorher, ob sie für dieses Board gebaut ist, und lehnt sie sonst ab.

## Systemgeneration

Designer und Firmware teilen eine Systemgeneration, zum Beispiel 1.0. Ändert sich die erste Zahl, verstehen sich die beiden nicht mehr. Der Designer verweigert dann das Übertragen eines Projekts und verlangt zuerst ein Firmware-Update. Ändert ein Update die Systemgeneration, weist der Dialog darauf hin. Übertrage dein Projekt danach noch einmal.

## Ein Board, das nie im Designer auftaucht

Ein neues Board hat noch keine Schaltli-Firmware, der Designer kann es also nicht aktualisieren. Es muss einmal über USB [geflasht](/geraete/flashen) werden. Der Link <span class="ui">Flash it over USB</span> im Firmware-Bereich führt zum Flasher.

Android-Handys haben keine Firmware. Neue Versionen der App installierst du wie beim ersten Mal, siehe [Android-App](/geraete/android#installieren).
