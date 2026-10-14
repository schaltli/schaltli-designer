# Verbindungen und Ports

Diese Seite zeigt, welche Teile von Schaltli miteinander reden, über welche Ports und wer die Verbindung öffnet. Auf einem Pekaway-System richtet das [Installationsskript](/installieren/pekaway) alles ein, und du brauchst sie nicht. Wichtig wird sie, wenn der Designer woanders läuft, etwa auf einem Heimserver oder in einer VM, oder wenn eine Firewall dazwischen sitzt.

<figure>
<svg class="schaltli-diagram" viewBox="0 0 760 392" role="img" aria-labelledby="verb-titel verb-desc">
  <title id="verb-titel">Wer mit wem redet</title>
  <desc id="verb-desc">Browser, Geräte und VanPi-Brücke verbinden sich zum MQTT-Broker auf dem Rechner im Van. Der Browser öffnet ausserdem den Designer. Das Gerät holt Projekt und Firmware beim Designer. Seine Beschreibung schickt es über den Broker.</desc>
  <defs>
    <marker id="pfeil-verb" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="8" markerHeight="6" orient="auto">
      <path class="arrowhead" d="M0,0 L8,3 L0,6 z" />
    </marker>
  </defs>
  <rect class="zone" x="190" y="8" width="315" height="376" rx="10" />
  <text class="eyebrow" x="206" y="30">RECHNER IM VAN</text>

  <rect class="node" x="8" y="150" width="150" height="80" rx="6" />
  <text class="name" x="83" y="184" text-anchor="middle">Browser</text>
  <text class="sub" x="83" y="204" text-anchor="middle">Laptop oder Tablet</text>

  <rect class="node" x="220" y="44" width="270" height="80" rx="6" />
  <text class="name" x="355" y="76" text-anchor="middle">Designer</text>
  <text class="tech" x="355" y="98" text-anchor="middle">HTTP :3000 · PEKAWAY :80</text>

  <rect class="node focal" x="220" y="170" width="270" height="80" rx="6" />
  <text class="name" x="355" y="202" text-anchor="middle">MQTT-Broker</text>
  <text class="tech" x="355" y="224" text-anchor="middle">:1883 · WEBSOCKET :9001</text>

  <rect class="node" x="220" y="296" width="270" height="72" rx="6" />
  <text class="name" x="355" y="326" text-anchor="middle">VanPi-Brücke</text>
  <text class="tech" x="355" y="348" text-anchor="middle">NODE-RED · NUR PEKAWAY</text>

  <rect class="node" x="592" y="44" width="160" height="206" rx="6" />
  <text class="name" x="672" y="150" text-anchor="middle">Geräte</text>
  <text class="tech" x="672" y="174" text-anchor="middle">KEIN PORT OFFEN</text>

  <path class="connector command" d="M158,170 H176 V84 H218" marker-end="url(#pfeil-verb)" />
  <text class="tech" x="170" y="120" text-anchor="end">HTTP</text>
  <path class="connector command" d="M158,210 H218" marker-end="url(#pfeil-verb)" />
  <text class="tech" x="200" y="202" text-anchor="middle">WS</text>
  <path class="connector" d="M355,296 V252" marker-end="url(#pfeil-verb)" />
  <text class="tech" x="362" y="278">MQTT</text>
  <path class="connector" d="M592,210 H492" marker-end="url(#pfeil-verb)" />
  <text class="tech" x="548" y="202" text-anchor="middle">MQTT</text>
  <path class="connector command" d="M592,104 H492" marker-end="url(#pfeil-verb)" />
  <text class="tech" x="548" y="122" text-anchor="middle">PROJEKT</text>
  <text class="tech" x="548" y="135" text-anchor="middle">FIRMWARE</text>
</svg>
<figcaption>Jeder Pfeil zeigt von dem Teil, das die Verbindung öffnet, zu dem, das zuhört. Gestrichelte Verbindungen gibt es nur beim Gestalten und Übertragen, im Betrieb reden die Geräte nur mit dem Broker.</figcaption>
</figure>

## Im Betrieb

Geräte und VanPi-Brücke reden nur mit dem Broker, über Port 1883. Jedes Gerät hat sein Projekt selbst gespeichert. Designer und Browser können aus sein, die Screens zeigen und schalten trotzdem.

## Beim Gestalten und Übertragen

| von | zu | Port | wozu |
|---|---|---|---|
| Browser | Designer | 3000, auf Pekaway 80 | den Designer öffnen, Projekte speichern und laden |
| Browser | Broker | 9001 (WebSocket) | Werte für die Vorschau, Geräte finden, ein Projekt oder eine Firmware in Auftrag geben |
| Gerät | Broker | 1883 | Werte lesen, Befehle schicken, sich anmelden, Aufträge empfangen, seine Beschreibung schicken |
| VanPi-Brücke | Broker | 1883 | Werte der Anlage ablegen, Befehle weiterreichen |
| Gerät | Designer | wie im Browser | Projekt und Firmware herunterladen |
| Browser | Internet | 443 | Icon-Suche |

Ein Projekt geht in zwei Schritten aufs Gerät. Der Browser legt auf dem Broker einen Auftrag ab, mit der Adresse der Datei. Das Gerät liest den Auftrag und lädt die Datei dann selbst beim Designer herunter. Mit der Firmware ist es genauso. Der Designer nennt dem Gerät dafür seine eigene Adresse im Netz und den Port, unter dem du ihn im Browser geöffnet hast.

Meldet sich ein Gerät zum ersten Mal, fragt der Browser über den Broker nach seiner Beschreibung: Bildschirmgrösse, Schriften, was es zeichnen kann. Das Gerät legt sie auf dem Broker ab, rund 300 KB, und der Browser gibt sie dem Designer weiter. Auch <span class="ui">Recover from Device...</span> holt die Kopie des Projekts so. Der Designer verbindet sich nie selbst zu einem Gerät, und auf den Geräten ist kein Port offen.

Der Designer-Server selbst hat keine Verbindung zum Broker. Alles, was über MQTT läuft, läuft im Browser.

Vor Firmware fw-2026.10.14.1 und App 0.12.0 holte der Designer die Beschreibung direkt beim Gerät, über Port 80 beim Board und 8080 bei Android. Bei einem Gerät mit älterer Firmware oder App macht er das weiterhin so.

## Einmal beim Einrichten

- **Firmware flashen:** Der [Flasher](/geraete/flashen) läuft im Browser und kommt aus dem Internet. Er spricht über USB direkt mit dem Board, ein Netz braucht es dafür nicht.
- **WLAN eintragen:** Ein Board ohne WLAN öffnet ein eigenes WLAN. Du verbindest dich mit dem Handy und trägst dort WLAN und Broker ein, siehe [WLAN und MQTT einrichten](/geraete/einrichten).

## Designer in einer VM {#vm}

Neue Geräte findet der Designer auch in einer VM mit NAT, denn das läuft ganz über den Broker.

<!-- handbuch-macke #70: Geräte laden Projekt und Firmware von der eigenen Adresse des Designers -->
::: warning Geräte müssen den Designer erreichen
Ein Gerät lädt Projekte und Firmware von der Adresse, die der Designer selbst im Netz hat. Läuft der Designer in einer VM mit NAT, ist das eine Adresse innerhalb der VM, und die Übertragung bleibt hängen. Gib der VM einen Netzwerkadapter im Bridge-Modus, dann hängt sie im selben Netz wie die Geräte.
:::

Steht eine Firewall dazwischen, müssen auf dem Rechner mit Designer und Broker die Ports 3000 (oder 80), 1883 und 9001 offen sein. Auf den Geräten muss kein Port offen sein.

## Anmeldung am Broker

Der Broker verlangt heute keine Anmeldung, siehe [MQTT-Broker und Topics](/betrieb/mqtt). Schütze das WLAN des Vans deshalb mit einem Passwort.
