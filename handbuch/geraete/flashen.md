# Firmware flashen

Ein neues Board kommt ohne Schaltli aus der Schachtel. Einmal musst du die Firmware deshalb über das USB-Kabel aufspielen. Danach kommen Projekte und Updates per WLAN über den Designer.

Das erledigt der **Flasher**, eine Webseite, die direkt im Browser arbeitet. Du installierst nichts, keine Treiber und kein Python.

<p><a class="schaltli-button" href="/schaltli-designer/flasher/" target="_self">Flasher öffnen</a></p>

## Was du brauchst

- Einen Computer mit **Chrome oder Edge**. Firefox und Safari können nicht mit einem seriellen Anschluss sprechen, Handys und Tablets auch nicht.
- Ein USB-C-Kabel, das Daten überträgt, nicht nur Strom.
- Eines der Boards: [Knob](/geraete/knob), [4.3B](/geraete/waveshare-4-3b) oder [PaperS3](/geraete/papers3).

## In drei Schritten

Der Flasher ist englisch beschriftet, wie der Designer.

1. **<span class="ui fw">Which board do you have?</span>** Wähle dein Board. Nichts ist vorausgewählt, und das mit Absicht: Alle drei Boards haben denselben Chip, der Flasher kann sie nicht unterscheiden. Ein falsch gewähltes Board startet danach nicht richtig, lässt sich aber mit der richtigen Wahl einfach neu flashen.
2. **<span class="ui fw">Which firmware?</span>** Vorausgewählt ist die neueste Version. Die beiden älteren stehen für den Fall bereit, dass eine neue Version Ärger macht.
3. **<span class="ui fw">Connect and write</span>** Steck das Board an und klick auf den Knopf. Der Browser fragt, welcher Anschluss es ist. Wähle den neu aufgetauchten. Der Flasher schreibt die Firmware und startet das Board neu.

Danach zeigt das Board einen Einrichtungsbildschirm mit QR-Code. Weiter geht es mit [WLAN und MQTT einrichten](/geraete/einrichten).

## Wenn es nicht klappt

<span class="ui fw">Erase the whole chip first.</span> löscht vor dem Schreiben alles auf dem Board, auch gespeicherte WLAN- und MQTT-Einstellungen. Ohne das Häkchen bleiben diese Einstellungen erhalten, und ein schon eingerichtetes Board ist nach dem Flashen gleich wieder im Netz. Setz das Häkchen, wenn das Board vorher mit einer anderen Software lief oder wenn ein Flashen nicht klappt.

Antwortet das Board nicht, halte beim Verbinden die BOOT-Taste des Boards gedrückt. Beim Knob ist das nicht nötig; dort hilft es, den USB-C-Stecker umgedreht einzustecken.

Meldet der Flasher, das Board sei ein anderer Chip als ein ESP32-S3, steckt das Kabel vermutlich im falschen Gerät oder, beim Knob, falsch herum.

Stimmt die heruntergeladene Datei nicht mit ihrer Prüfsumme überein, bricht der Flasher ab, bevor er etwas schreibt. Versuch es dann einfach noch einmal.
