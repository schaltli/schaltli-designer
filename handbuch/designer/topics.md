# MQTT-Topics

Alles, was ein Screen anzeigt oder schaltet, läuft über Topics auf dem MQTT-Broker. Ein Topic ist ein Name wie `schaltli/state/tank/1/level`, unter dem ein Wert liegt, etwa `62`. Die [Bausteine](/designer/bausteine) erledigen das von selbst für alles, was Geräte auf dem Broker ankündigen. Diese Seite ist für alles andere.

## Lesen und schalten

Schaltli trennt, was ist, von dem, was werden soll:

- Unter `schaltli/state/…` liegt der **Zustand**: der Füllstand, ob das Licht an ist. Diese Werte bleiben auf dem Broker liegen («retained»), damit ein Gerät nach dem Einschalten sofort den aktuellen Stand kennt.
- An `schaltli/cmnd/…` gehen **Befehle**: «Licht an», «Dimmer auf 40». Befehle bleiben nicht liegen.

Ein Schalter liest deshalb das eine Topic und schreibt in ein anderes. Er zeigt «an», wenn die Anlage meldet, dass das Licht an ist, nicht schon, wenn jemand getippt hat. So stimmt die Anzeige immer mit dem Van überein.

Wie das im Einzelnen abläuft, zeigt [MQTT an drei Beispielen](/designer/mqtt-beispiele) an einem Tank, einem Dimmer und einer Heizung.

## Topics im Projekt

Die Topics eines Projekts stehen unter <span class="ui">Settings</span> › <span class="ui">Topics</span>.

<Screenshot narrow name="einstellungen-topics" alt="Die Projekteinstellungen mit der Liste der Topics" caption="Die Topics, die die Bausteine eingetragen haben." />

<span class="ui">Add Topic</span> trägt eines von Hand ein:

- <span class="ui">Topic Name</span>: der vollständige Name.
- <span class="ui">Type</span>: <span class="ui">Text</span>, <span class="ui">Numeric</span> für Zahlen oder <span class="ui">JSON</span>, wenn eine Nachricht mehrere Werte enthält.
- <span class="ui">Examples</span>: Beispielwerte. Der erste ist das, was der Editor anzeigt, damit du beim Gestalten etwas siehst. Die Simulation in der Vorschau benutzt sie auch.
- <span class="ui">Mock Responses</span>: nur für die [Simulation](/designer/vorschau#simulation). Hier legst du fest, wie ein Befehl beantwortet wird, etwa dass «on» auf dem Befehls-Topic den Zustand auf «on» setzt.
- Bei JSON zusätzlich <span class="ui">Subtopics</span>: die einzelnen Felder der Nachricht. <span class="ui">Detect from examples</span> liest sie aus den Beispielwerten.

<span class="ui">Remove unused topics</span> entfernt auf einmal alle Topics, die nichts im Projekt liest oder schreibt: kein Objekt, keine Aktion, kein Wert im Text und kein Combined topic. Die Zahl in Klammern sagt, wie viele es sind. Der Designer fragt nicht nach, <kbd>Strg</kbd>+<kbd>Z</kbd> holt sie zurück.

## Topics vom Broker holen

Der Designer hört im Hintergrund mit, sobald er mit dem Broker verbunden ist, und merkt sich jedes Topic, das vorbeikommt, mit seinen letzten 20 Nachrichten. Der Schalter <span class="ui">Listening</span> unten in der Statusleiste schaltet das aus und wieder ein, der Browser merkt sich die Wahl. Was der Designer gehört hat, behält er nur, solange der Tab offen ist.

<span class="ui">Listen to Broker</span> hört eine Weile mit, was auf dem Broker passiert, und listet alle Topics, die dabei vorkommen. <span class="ui">retained</span> heisst, der Wert lag schon auf dem Broker; <span class="ui">live</span>, er kam erst während des Mithörens. Den Typ erkennt der Designer selbst.

Am Anfang ist keines ausgewählt. Wähle die Topics aus, die du brauchst, das Filterfeld hilft bei langen Listen, und übernimm sie mit <span class="ui">Add Selected Topics</span>. Nimm nur, was ein Screen zeigen oder schalten soll: Die Vorschau hört jedes Topic des Projekts mit.

Der Dialog verbindet sich selbst mit dem Broker auf dem Rechner, auf dem der Designer läuft. Unter <span class="ui">Connection settings</span> stellst du einen anderen ein: <span class="ui">WebSocket URL</span> ist seine Adresse, <span class="ui">Discovery prefix</span> das Topic, unter dem sich Geräte für Home Assistant anmelden. Meist ist das `homeassistant`, und leer gilt genau das. Beides merkt sich der Browser, bis du es änderst.

Topics, die schon im Projekt sind, stehen mit <span class="ui">in project</span> in der Liste. Du kannst sie nicht noch einmal wählen, und <span class="ui">Add Selected Topics</span> legt sie nie ein zweites Mal an.

## Ein Topic an ein Objekt binden

In den Eigenschaften eines Objekts steht unter <span class="ui">Data</span>, welches Topic es liest und, bei Schaltern und Reglern, in welches es schreibt. Die Auswahl zeigt die Topics des Projekts als Baum. Ganz unten führt <span class="ui">Manage Topics...</span> zu den Projekteinstellungen.

Bei einem JSON-Topic wählst du daneben das Feld. Ohne Wahl gilt <span class="ui">Whole payload</span>, die ganze Nachricht. Ein Feld schreibst du als Pfad: `temp`, `nested.temp` oder `readings[0].value`. Geschrieben wird immer die ganze Nachricht, deshalb gibt es bei Schreib-Topics keine Feldauswahl.

Liest ein Objekt ein Topic, das nicht im Projekt eingetragen ist, markiert der Designer es mit <span class="ui">unregistered</span>.

## Combined topics {#combined}

Manches hängt an mehr als einem Wert: Glatt wird es, wenn es friert und nass ist, Licht brennt im Van, sobald irgendeine Lampe an ist. Ein Combined topic fasst das zusammen. Es ist «ja», wenn alle oder irgendeine seiner Bedingungen zutreffen, und lässt sich danach überall lesen, wo ein Wert gelesen wird: in einem [Wert im Text](/objekte/anzeigen#platzhalter) und in einem [Icon mit Live](/objekte/anzeigen#icon). Das Gerät rechnet es selbst aus. Es schickt nichts an den Broker, und auf die Brücke oder Node-RED musst du dafür nicht zugreifen.

Unter <span class="ui">Settings</span> › <span class="ui">Topics</span> legt <span class="ui">Add combined topic</span> eines an. Gib ihm einen Namen ohne Leerzeichen. Dann wählst du, ob es ja ist, wenn alle (<span class="ui">all</span>) oder irgendeine (<span class="ui">any</span>) seiner Bedingungen zutreffen, und fügst mit <span class="ui">+ Add condition</span> Bedingungen hinzu. Eine Bedingung vergleicht einen Wert wie eine Regel in einem Wert im Text, mit `<`, `==`, «is yes» und so weiter.

Eine Bedingung darf auch ein anderes Combined topic lesen. So entsteht Schritt für Schritt, was sich in einem einzigen Formular nicht sagen liesse:

| Name | ist ja, wenn |
|---|---|
| `frost` | all: Aussentemperatur < 1 |
| `nass` | any: Regen is yes, Feuchte > 90 |
| `glaette` | all: `frost` is yes, `nass` is yes |

Solange noch nicht alle Werte angekommen sind, gilt: Bei «any» genügt ein Ja, bei «all» ein Nein. Sonst hat das Combined topic noch keinen Wert, und ein Text oder Icon, das es liest, zeigt seinen Eintrag für <span class="ui">No value yet</span>.

Ein Combined topic darf nicht über andere wieder auf sich selbst verweisen. Diese zirkuläre Referenz bietet die Auswahl gar nicht erst an. Steht sie trotzdem im Projekt, etwa nach einer Bearbeitung von Hand, zeigt der Designer sie rot und verweigert das Übertragen, bis du sie auflöst. Mehr als acht Stufen ineinander gehen ebenfalls nicht.

Ein Combined topic, das noch gelesen wird, lässt sich nicht löschen. Der Designer sagt dann, wer es liest. Benennst du es um, ziehen alle Verweise mit.

::: warning Ältere Firmware
Combined topics rechnen Knob, 4.3B, PaperS3 und die Android-App ab Systemgeneration 1.4 selbst. Mit älterer Firmware oder einer älteren App bleibt ein Wert im Text, der eines liest, leer. Ein Icon zeigt dort auf den Boards sein <span class="ui">Otherwise</span> und in der App gar keines. Beim Übertragen nennt der Dialog die betroffenen Objekte.
:::

## Local topics {#local}

Manche Werte gehen nur das Display etwas an, das sie zeigt: ob ein Screen das Energiediagramm als Flow oder als Sankey zeigt, welcher Teil einer Seite gerade offen ist. Als MQTT-Topic gälte so ein Wert für alle Displays im Van zugleich, und auf dem Broker müsste ihn jemand halten. Ein Local topic hält das Display selbst. Ein Schalter oder Button setzt es, und lesen kann es alles, was sonst ein Topic liest. Das Gerät verlässt es nie, es wird weder publiziert noch abonniert. So hat jedes Display seinen eigenen Wert.

Local topics stehen unter <span class="ui">Settings</span> › <span class="ui">Topics</span> in einer eigenen Liste, unter den Combined topics. <span class="ui">Add local topic</span> legt eines an:

- Der Name ist frei, ohne Leerzeichen, `#` und `+`, und kein anderes Topic darf ihn schon haben. Der Designer schlägt einen unter `local/` vor, damit man ihm ansieht, was er ist. Ob ein Topic lokal ist, entscheidet aber die Liste, in der es steht, nicht sein Name.
- Der Typ ist <span class="ui">text</span> oder <span class="ui">numeric</span>.
- <span class="ui">Initial value</span> ist der Wert, mit dem das Display startet, nach jedem Neustart und jedem Übertragen wieder. Ohne ihn hat das Topic zuerst keinen Wert, und ein Switcher zeigt sein erstes Panel.

In der Auswahl eines Objekts stehen Local topics wie alle anderen. Die [Vorschau](/designer/vorschau) hält sie in der Simulation und im Live-Modus gleich: Ein Tipp setzt den Wert sofort, auf den Broker geht nichts. Rechts in den Topic-Werten sind sie mit <span class="ui">local</span> markiert und lassen sich auch live ändern.

Trägt der Broker ein echtes Topic mit dem Namen eines Local topics, erreicht es das Display nicht. <span class="ui">Listen to Broker</span> markiert es mit <span class="ui">local topic</span>, bietet es nicht an und sagt das über der Liste.

::: warning Ältere Firmware
Knob, 4.3B und PaperS3 kennen Local topics ab der Firmware fw-2026.10.13.2, die Android-App ab Version 0.11.0. Eine ältere Version würde eines wie ein gewöhnliches Topic behandeln: Sie abonniert es auf dem Broker und publiziert, was ein Schalter hineinschreibt. Deshalb überträgt <span class="ui">Deploy</span> ein Projekt mit Local topics nur auf ein Gerät, das sie kennt. Ein älteres Board bringt der Designer vorher auf den neuen Stand. Bei der App bittet er um ein Update.
:::

## Welcher Broker?

Der Designer spricht den Broker über WebSocket an, unter derselben Adresse, unter der du den Designer geöffnet hast, auf Port 9001. Auf einem Pekaway-System richtet das [Installationsskript](/installieren/pekaway) das ein. Gibst du in einem der Dialoge eine andere Adresse ein, merkt sich der Browser sie. Benutzername und Passwort für den Broker behält der Designer selbst, für jeden Browser, siehe [Anmeldung am Broker](/betrieb/verbindungen#anmeldung).
