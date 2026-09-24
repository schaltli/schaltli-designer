# MQTT-Topics

Alles, was ein Screen anzeigt oder schaltet, läuft über Topics auf dem MQTT-Broker. Ein Topic ist ein Name wie `schaltli/state/tank/1/level`, unter dem ein Wert liegt, etwa `62`. Die [Bausteine](/designer/bausteine) erledigen das für die üblichen Werte des Vans von selbst. Diese Seite ist für alles andere.

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

## Topics vom Broker holen

<span class="ui">Discover MQTT Topics</span> hört eine Weile mit, was auf dem Broker passiert, und listet alle Topics, die dabei vorkommen. <span class="ui">retained</span> heisst, der Wert lag schon auf dem Broker; <span class="ui">live</span>, er kam erst während des Mithörens. Den Typ erkennt der Designer selbst.

Wähle die gewünschten Topics aus, das Filterfeld hilft bei langen Listen, und übernimm sie mit <span class="ui">Add Selected Topics</span>.

::: warning Doppelte Einträge
<!-- handbuch-macke #11: Discovery legt Topics doppelt an -->
Topics, die schon im Projekt sind, trägt <span class="ui">Add Selected Topics</span> ein zweites Mal ein. Wähle nur die aus, die noch fehlen.
:::

## Ein Topic an ein Objekt binden

In den Eigenschaften eines Objekts steht unter <span class="ui">Data</span>, welches Topic es liest und, bei Schaltern und Reglern, in welches es schreibt. Die Auswahl zeigt die Topics des Projekts als Baum. Ganz unten führt <span class="ui">Manage Topics...</span> zu den Projekteinstellungen.

Bei einem JSON-Topic wählst du daneben das Feld. Ohne Wahl gilt <span class="ui">Whole payload</span>, die ganze Nachricht. Ein Feld schreibst du als Pfad: `temp`, `nested.temp` oder `readings[0].value`. Geschrieben wird immer die ganze Nachricht, deshalb gibt es bei Schreib-Topics keine Feldauswahl.

Liest ein Objekt ein Topic, das nicht im Projekt eingetragen ist, markiert der Designer es mit <span class="ui">unregistered</span>.

## Welcher Broker?

Der Designer spricht den Broker über WebSocket an, unter derselben Adresse, unter der du den Designer geöffnet hast, auf Port 9001. Auf einem Pekaway-System richtet das [Installationsskript](/installieren/pekaway) das ein. Gibst du in einem der Dialoge eine andere Adresse ein, merkt sich der Browser sie. Benutzername und Passwort speichert er nicht.
