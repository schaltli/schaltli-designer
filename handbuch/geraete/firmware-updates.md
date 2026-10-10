# Firmware-Updates

Ist ein Board einmal eingerichtet, kommt neue Firmware per WLAN, über den Designer. Ein Kabel brauchst du dafür nicht mehr.

Jede Version des Designers bringt die Firmware mit, die zu ihr passt. Das [Installationsskript](/installieren/pekaway) lädt sie bei jedem Update mit herunter, und der Designer gibt sie den Boards im lokalen Netz weiter. Die Boards brauchen dafür keinen Internetzugang.

## So geht's

Das macht [Deploy to Device](/designer/deploy) von selbst. Wählst du dort ein Board, steht unter der Liste, welche Firmware es hat und ob der Designer eine neuere mitbringt: «Firmware fw-2026.10.04.2 · Deploy installs fw-2026.10.09.1 first». Ein Klick auf <span class="ui">Update & Deploy</span> spielt zuerst die Firmware auf und dann das Projekt.

Das Board lädt die Firmware, prüft sie und startet neu. Der Dialog zeigt jeden Schritt. Auf dem Board steht währenddessen «Firmware-Update / bitte nicht ausschalten».

Geht dabei etwas schief, bricht das Board ab und läuft mit seiner bisherigen Firmware weiter. Es schreibt die neue in einen zweiten Speicherbereich und wechselt erst, wenn sie vollständig und geprüft ist. Das Projekt wird dann nicht übertragen.

Ein Board, das nicht online ist, bekommt kein Update. Der Dialog sagt, was zu prüfen ist.

Eine neuere Firmware als die mitgebrachte, etwa eine Testversion, ersetzt Deploy nie.

## Ohne Projekt

Unter dem Link <span class="ui">Firmware...</span> im selben Dialog spielst du eine Firmware auch ohne Projekt auf. <span class="ui">Install release</span> installiert die Version, die der Designer mitbringt, zum Beispiel um ein Board aktuell zu machen, bevor es ein Projekt bekommt. Hat das Board eine neuere Firmware, fragt der Dialog nach und nennt beide Versionen, denn damit stufst du es herunter.

## Eine Datei aufspielen

<span class="ui">From file...</span> spielt eine Firmware-Datei von deinem Computer auf, etwa eine Testversion. Der Designer prüft vorher, ob sie für dieses Board gebaut ist, und lehnt sie sonst ab.

## Systemgeneration

Designer und Firmware teilen eine Systemgeneration, zum Beispiel 1.0. Ändert sich die erste Zahl, verstehen sich die beiden nicht mehr. Der Designer verweigert dann das Übertragen eines Projekts und verlangt zuerst ein Firmware-Update. Ändert ein Update die Systemgeneration, weist der Dialog darauf hin. Übertrage dein Projekt danach noch einmal.

## Ein Board, das nie im Designer auftaucht

Ein neues Board hat noch keine Schaltli-Firmware, der Designer kann es also nicht aktualisieren. Es muss einmal über USB [geflasht](/geraete/flashen) werden. Der Link <span class="ui">Flash it over USB</span> unter <span class="ui">Firmware...</span> führt zum Flasher.

Android-Handys haben keine Firmware. Neue Versionen der App installierst du wie beim ersten Mal, siehe [Android-App](/geraete/android#installieren).
