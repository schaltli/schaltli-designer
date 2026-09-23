# ScreenBee → Schaltli: die vollständige Umbenennung

Der Name ScreenBee ist vergeben (Databee-App, ein polnischer Maschinenbauer,
`.com/.eu/.de/.app` alle belegt). Nachfolger ist **Schaltli**, `schaltli.com`
ist registriert, der Markensatz liegt seit dem 22.09. unter `brand/`.

Bestandsaufnahme vom 23.09.: **878 echte Treffer in rund 200 Dateien**, über
vier Repos. Drei Generationen Altlasten liegen darin übereinander —
`Papyr` (85, nur im E-Paper-Repo), `Screenman` (23), `Screensmith` (294, fast
alles Kotlin-Paketpfade), `ScreenBee` (481).

Eine Falschmeldung, die bleibt: `lib/export-utils.ts` erzeugt Arduino-Code mit
einer Variablen `screenManager`. Das ist „screen manager", nicht der Name.

## Entschieden

| Frage | Entscheidung |
|---|---|
| GitHub-Repos | **umbenennen**, alle vier |
| Abbild-Kennung `<<screenbee-image …>>` | **wechselt**, ohne Zwischenfassung — über USB geflasht, das umgeht die OTA-Prüfung. Jedes Board, das die Software je hatte, liegt auf dem Tisch |
| Pi-Installation | **alles** auf Schaltli: Domain, systemd-Unit, nginx-Site, Mosquitto-Conf, Installationspfad |
| Android-Kennung | **neue** `applicationId` — die App ist danach für Android eine andere, die alte bleibt daneben stehen und wird von Hand entfernt |
| Doorman-, ECTIVE-, MaxxFan-Flow | **nicht** in dieses Repo |

## Die neuen Namen

```
Produkt            Schaltli
MQTT-Präfix        schaltli            (war screenbee)
Zustand/Befehl     schaltli/state/     schaltli/cmnd/
Abbild-Kennung     <<schaltli-image device=…>>
Android            com.schaltli.android   (Paket UND applicationId)
npm-Paket          schaltli-designer
Umgebungsvariablen SCHALTLI_*
AP (nur E-Paper)   Schaltli-Setup / schaltli12345
NVS (nur E-Paper)  schaltli
Repos              schaltli-{designer,firmware,eink,android}
Domain             schaltli.peka.way
Dienst/Pfad        schaltli-designer, /home/pi/schaltli-designer
Flasher-Seite      matthias-hess.github.io/schaltli-designer/
Node-RED           schaltli-vanpi-bridge, …-broker
```

## Was auf dem Draht steht, und warum es hier einen Schnitt gibt

Sechs unabhängige Kopien halten das Präfix: Designer, drei Farb-Boards,
E-Paper, Android. Dazu vier weitere im HIL-Anzug. Sie müssen gemeinsam
wechseln, sonst verstummt ein Gerät.

Gemessen am 23.09., bevor irgendetwas angefasst wurde:

- **Im Bus lauscht niemand.** Der Fahrzeug-Broker trägt nur die Bridge-Werte
  (rund 78 retained unter `screenbee/state/…`) und zwei Anmeldungen, beide
  `status = offline` — und es sind dieselben zwei Boards, die hier liegen.
- **Zu Hause hängt die ganze Flotte**: Knopf, 4.3B, PaperS3, E-Paper, P20,
  alle `online`.

Deshalb ein Schnitt statt einer Migration mit Doppel-Abonnement.

**Retained bleibt liegen.** Was unter dem alten Präfix retained ist, steht dort
bis jemand leere Nutzlasten darüberschreibt. Das gehört in den Ablauf, sonst
liegt auf beiden Brokern für immer ein toter Baum.

**Eine Falle im Bridge-Installateur:** er erkennt die vorhandene Bridge an der
Knotenkennung `screenbee-vanpi-bridge-broker` und aktualisiert den Tab an Ort
und Stelle. Wird die Kennung umbenannt, ohne dass er die alte noch kennt,
findet er nichts, legt einen **zweiten** Tab an — und zwei Bridges
veröffentlichen dieselben Werte. Der Installateur muss die alte Kennung
übergangsweise mitlesen.

**Browser-Schlüssel wandern mit Rückfall.** `screenbee-mqtt-connection` hält
die Broker-Zugangsdaten des Nutzers. Ein stiller Wechsel setzt sie zurück;
der neue Schlüssel liest den alten einmal, wenn er selbst leer ist.

## Reihenfolge

1. **Designer** — Präfix, Kennung, Client-Kennungen, Browser-Schlüssel,
   sichtbarer Text, Marke, `package.json`, Umgebungsvariablen, Bridge,
   Installationsskript, Handbücher, die e2e-Prüfungen, die diese Strings
   wörtlich behaupten (allein `e2e/vanpi-bridge.spec.ts` hat 52).
2. **Farb-Firmware** — `TOPIC_PREFIX` ×3, Kennung, Portal-Text, `ddf-source`,
   DDF neu bauen, `DDF_VERSION` heben, `release-firmware.js`.
3. **E-Paper-Firmware** — dasselbe, dazu AP-SSID, PSK und NVS-Namensraum.
   Die dreizehn veralteten `Papyr`-Handbücher beschreiben Klassen, die es
   nicht mehr gibt: sie wandern unverändert nach `docs/historisch/` statt
   umbenannt zu werden, sonst sehen sie aktuell aus und sind es nicht.
4. **Android** — Paket und `applicationId`, `ScreensmithApp`/`Theme`/`Root`,
   Farbnamen, `app_name`, `TOPIC_PREFIX`, Ordnername.
5. **Repos umbenennen**, Fernadressen nachziehen, Pages neu veröffentlichen,
   `manifest.json` und `FLASHER_URL` korrigieren.
6. **Ausrollen** — vier Boards über USB, App neu installieren, Pi nachziehen
   (Checkout, Installationsskript, Bridge), retained unter dem alten Präfix
   auf beiden Brokern löschen.
7. **Messen** — typecheck, e2e, die vier Host-Prüfungen, Conformance,
   Android-HIL, `npm run test:all`.

## Was liegen bleibt, ausgesprochen

- **Der lokale Ordner des Designers** heißt weiter `v0-screenman-editor-design`.
  Er ist das Arbeitsverzeichnis der laufenden Sitzung und lässt sich nicht
  unter ihr selbst wegziehen. Eine Zeile, sobald keine Sitzung darin steht.
- **`schaltli.peka.way` braucht einen DNS-Eintrag** in einer Zone, die Pekaway
  gehört. Bis der steht, ist der Bus-Designer über die IP erreichbar.
- **Die alte Android-App** bleibt auf dem P20 liegen, bis sie von Hand
  entfernt wird. Das ist der Preis der neuen `applicationId`.
