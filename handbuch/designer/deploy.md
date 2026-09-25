# Auf ein Gerät übertragen

<span class="ui">File</span> › <span class="ui">Deploy to Device</span> schickt das Projekt auf ein Gerät. Das Gerät holt es sich vom Designer, prüft es und startet damit neu.

<Screenshot narrow name="deploy-dialog" alt="Der Dialog Deploy to Device mit ausgewähltem Board" />

## Das Gerät wählen

Der Dialog verbindet sich mit dem Broker und listet alle Geräte, die zum Projekt passen, also denselben Gerätetyp haben. Boards heissen nach ihrem Typ und einer Kennung, Android-Handys nach ihrem Modell.

- Ein grünes WLAN-Zeichen heisst: Das Gerät ist online.
- <span class="ui">will apply on reconnect</span>: Das Gerät ist gerade nicht online. Überträgst du trotzdem, holt es sich das Projekt, sobald es wieder da ist.
- <span class="ui">firmware update</span>: Der Designer bringt eine neuere Firmware mit, siehe [Firmware-Updates](/geraete/firmware-updates).

Findet der Dialog kein passendes Gerät, sagt er, welche Geräte sich stattdessen melden. Oft steckt dahinter ein Projekt, das für einen anderen Gerätetyp angelegt wurde.

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

## Nach dem Übertragen

In den [Versionen](/designer/versionen) ist die übertragene Version mit dem Gerät markiert, in der Projektliste steht es beim Projekt. Ausserdem behält das Gerät eine Kopie des Projekts, die du später zurückholen kannst.

Unten im Dialog steht, welcher Designer, welche Systemgeneration und welche Firmware-Version hier laufen. Das hilft, wenn etwas nicht zusammenpasst.
