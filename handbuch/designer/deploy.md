# Auf ein Gerät übertragen

<span class="ui">File</span> › <span class="ui">Deploy to Device</span> schickt das Projekt auf ein Gerät. Das Gerät holt es sich vom Designer, prüft es und startet damit neu.

<Screenshot narrow name="deploy-dialog" alt="Der Dialog Deploy to Device mit ausgewähltem Board" />

## Das Gerät wählen

Der Dialog verbindet sich mit dem Broker und listet alle Geräte, die sich dort melden. Oben stehen die, für die das Projekt gemacht ist, darunter die übrigen mit dem Vermerk <span class="ui">Other device</span>. Boards heissen nach ihrem Typ und einer Kennung, Android-Handys nach ihrem Modell.

- Ein grünes WLAN-Zeichen heisst: Das Gerät ist online.
- <span class="ui">offline</span>: Das Gerät ist gerade nicht erreichbar. Übertragen geht erst, wenn es wieder online ist. Wählst du es aus, nennt der Dialog, was zu prüfen ist: Das Gerät muss eingeschaltet sein, im selben Netz wie der Designer hängen und als Broker die Adresse eingetragen haben, die der Dialog angibt, zum Beispiel `192.168.8.107:1883`. Etwas auf Vorrat zu schicken, das ein Gerät erst Tage später übernimmt, ist bewusst nicht möglich.

### Ein anderes Gerät

Ein Projekt ist für ein bestimmtes Gerät gemacht, mit dessen Bildschirmgrösse und Ausrichtung. Auf ein anderes Gerät überträgt der Dialog es nicht: Ein Projekt für den 4.3B mit 800×480 Pixeln wäre auf einem Tablet abgeschnitten oder winzig, und Teile würden fehlen.

Wählst du ein Gerät mit <span class="ui">Other device</span>, sagt der Dialog, für welches Gerät das Projekt gemacht ist. Mit <span class="ui">Switch this project to</span> stellst du das Projekt auf das gewählte Gerät um, wie unter <span class="ui">Settings</span> › <span class="ui">Device</span>. Bildschirmgrösse, Schriften und Tasten kommen dann vom neuen Gerät, deine Objekte bleiben, wo sie sind. Hat sich die Grösse geändert, sagt der Dialog das: Prüf deine Screens, bevor du überträgst, denn Objekte können jetzt ausserhalb liegen. <kbd>Strg</kbd>+<kbd>Z</kbd> nimmt das Umstellen zurück.

## Übertragen

Wähle das Gerät. Unter der Liste steht in einer Zeile, welche Firmware es hat und was <span class="ui">Deploy</span> tun wird, etwa «Firmware fw-2026.10.04.2 · Deploy installs fw-2026.10.09.1 first». Bringt der Designer eine neuere Firmware mit, als das Board hat, spielt er sie zuerst auf, wartet, bis das Board mit ihr zurück ist, und überträgt dann das Projekt. Der Knopf heisst dann <span class="ui">Update & Deploy</span>. Eine neuere Firmware, etwa eine Testversion, ersetzt er dabei nie durch eine ältere. Mehr dazu unter [Firmware-Updates](/geraete/firmware-updates).

Klick auf <span class="ui">Deploy</span>. Vorher speichert der Designer das Projekt, denn was auf einem Gerät läuft, soll auch im Designer liegen. Hat das Projekt noch keinen Namen, fragt er zuerst danach, wie beim ersten [Speichern](/designer/projekte#speichern). Brichst du dort ab, wird nichts übertragen.

Danach zeigt der Dialog jeden Schritt:

| Anzeige | Bedeutung |
|---|---|
| <span class="ui">Downloading</span> | das Gerät lädt das Projekt |
| <span class="ui">Verifying</span> | es prüft das Projekt |
| <span class="ui">Applying</span> | es übernimmt das Projekt |
| <span class="ui">Rebooting</span> | es startet neu; der Dialog wartet, bis es wieder da ist |
| <span class="ui">Deploy successful</span> | das Board ist mit dem neuen Projekt zurück, fertig |
| <span class="ui">Done</span> | fertig (Android-App, ohne Neustart) |
| <span class="ui">Already up to date</span> | das Gerät hat genau dieses Projekt schon |
| <span class="ui">Device is busy with another deploy</span> | es ist noch mit einer anderen Übertragung beschäftigt |
| <span class="ui">Failed</span> | etwas ging schief, darunter steht der Grund |

<Screenshot narrow name="deploy-fertig" alt="Der Dialog meldet Deploy successful" />

Kommt ein Board nach dem Neustart nicht innerhalb von drei Minuten zurück, sagt der Dialog das. Antwortet das Gerät nicht innerhalb von 30 Sekunden, nimmt der Designer den Auftrag zurück und meldet <span class="ui">The device did not respond</span>. Mit <span class="ui">Try again</span> versuchst du es noch einmal. Scheitert das Firmware-Update, wird das Projekt nicht übertragen, und das Board läuft mit seiner bisherigen Firmware weiter.

## Wenn der Dialog nicht überträgt

Übertragen wird nur, was das Gerät ganz zeigen kann. Lieber gar nichts als ein Projekt mit Lücken. Statt <span class="ui">Deploy</span> steht dann, woran es liegt und was zu tun ist:

- **Die Android-App ist zu alt** für Teile des Projekts, etwa Popups oder den Navigator. Aktualisiere die App, der Dialog verlinkt sie.
- **Die Firmware ist zu alt, und der Designer bringt keine neuere mit.** Spiel eine neuere über den [Flasher](/geraete/flashen) auf.
- **Das Gerät kennt einen Objekttyp gar nicht**, etwa einen Navigator auf dem runden Knob. Der Dialog nennt ihn. Entferne ihn aus dem Projekt oder wähle ein anderes Gerät.

## Nach dem Übertragen

In den [Versionen](/designer/versionen) ist die übertragene Version mit dem Gerät markiert, in der Projektliste steht es beim Projekt. Ausserdem behält das Gerät eine Kopie des Projekts, die du später zurückholen kannst.

Unten im Dialog steht, welcher Designer, welche Systemgeneration und welche Firmware-Version hier laufen. Das hilft, wenn etwas nicht zusammenpasst.
