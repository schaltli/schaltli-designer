# Auf ein Gerät übertragen

<span class="ui">File</span> › <span class="ui">Deploy to Device</span> schickt das Projekt auf ein Gerät. Das Gerät holt es sich vom Designer, prüft es und startet damit neu.

<Screenshot narrow name="deploy-dialog" alt="Der Dialog Deploy to Device mit ausgewähltem Board" />

## Das Gerät wählen

Der Dialog verbindet sich mit dem Broker und listet alle Geräte, die sich dort melden. Oben stehen die, für die das Projekt gemacht ist, darunter die übrigen mit dem Vermerk <span class="ui">Other device</span>. Boards heissen nach ihrem Typ und einer Kennung, Android-Handys nach ihrem Modell.

- Ein grünes WLAN-Zeichen heisst: Das Gerät ist online.
- <span class="ui">will apply on reconnect</span>: Das Gerät ist gerade nicht online. Überträgst du trotzdem, holt es sich das Projekt, sobald es wieder da ist.
- <span class="ui">firmware update</span>: Der Designer bringt eine neuere Firmware mit, siehe [Firmware-Updates](/geraete/firmware-updates).

### Ein anderes Gerät

Ein Projekt ist für ein bestimmtes Gerät gemacht, mit dessen Bildschirmgrösse und Ausrichtung. Auf ein anderes Gerät überträgt der Dialog es nicht: Ein Projekt für den 4.3B mit 800×480 Pixeln wäre auf einem Tablet abgeschnitten oder winzig, und Teile würden fehlen.

Wählst du ein Gerät mit <span class="ui">Other device</span>, sagt der Dialog, für welches Gerät das Projekt gemacht ist. Mit <span class="ui">Switch this project to</span> stellst du das Projekt auf das gewählte Gerät um, wie unter <span class="ui">Settings</span> › <span class="ui">Device</span>. Bildschirmgrösse, Schriften und Tasten kommen dann vom neuen Gerät, deine Objekte bleiben, wo sie sind. Hat sich die Grösse geändert, sagt der Dialog das: Prüf deine Screens, bevor du überträgst, denn Objekte können jetzt ausserhalb liegen. <kbd>Strg</kbd>+<kbd>Z</kbd> nimmt das Umstellen zurück.

## Übertragen

Wähle das Gerät und klick auf <span class="ui">Deploy</span>. Vorher speichert der Designer das Projekt, denn was auf einem Gerät läuft, soll auch im Designer liegen. Hat das Projekt noch keinen Namen, fragt er zuerst danach, wie beim ersten [Speichern](/designer/projekte#speichern). Brichst du dort ab, wird nichts übertragen.

Danach zeigt der Dialog jeden Schritt:

| Anzeige | Bedeutung |
|---|---|
| <span class="ui">Downloading</span> | das Gerät lädt das Projekt |
| <span class="ui">Verifying</span> | es prüft das Projekt |
| <span class="ui">Applying</span> | es übernimmt das Projekt |
| <span class="ui">Rebooting</span> | es startet neu, fertig |
| <span class="ui">Done</span> | fertig (Android-App, ohne Neustart) |
| <span class="ui">Already up to date</span> | das Gerät hat genau dieses Projekt schon |
| <span class="ui">Device is busy with another deploy</span> | es ist noch mit einer anderen Übertragung beschäftigt |
| <span class="ui">Failed</span> | etwas ging schief, darunter steht der Grund |

<Screenshot narrow name="deploy-fertig" alt="Der Dialog meldet Rebooting" />

## Warnungen vor dem Übertragen

- Enthält das Projekt Objekttypen, die die Firmware des Geräts nicht kennt, warnt der Dialog. Übertragen kannst du trotzdem, diese Objekte fehlen dann auf dem Gerät. Meist hilft ein [Firmware-Update](/geraete/firmware-updates).
- Ist die Firmware des Geräts so alt, dass sie das Projekt nicht lesen kann, verweigert der Dialog das Übertragen und verlangt zuerst ein Firmware-Update.
- Enthält ein Text [Werte](/objekte/anzeigen#platzhalter) aus Topics oder vom Gerät und kennen Firmware oder App sie noch nicht, warnt der Dialog ebenfalls. Das Gerät zeigt an Stelle eines Werts dann einen Platzhalter wie `{topic:…}`. Übertragen kannst du trotzdem.

## Nach dem Übertragen

In den [Versionen](/designer/versionen) ist die übertragene Version mit dem Gerät markiert, in der Projektliste steht es beim Projekt. Ausserdem behält das Gerät eine Kopie des Projekts, die du später zurückholen kannst.

Unten im Dialog steht, welcher Designer, welche Systemgeneration und welche Firmware-Version hier laufen. Das hilft, wenn etwas nicht zusammenpasst.
