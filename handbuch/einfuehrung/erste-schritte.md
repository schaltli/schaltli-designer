# Erste Schritte

Diese Seite führt dich einmal durch alles: vom installierten Designer bis zu einem Screen mit Tankanzeige, Batterie, Lichtschalter und Dimmer, der auf einem Display im Van läuft. MQTT-Kenntnisse brauchst du dafür nicht, die Bausteine erledigen das.

Als Beispiel dient der Waveshare 4.3B. Mit einem anderen Board oder einem [Android-Handy](/geraete/android) geht es genauso, nur das Einrichten des Geräts sieht etwas anders aus.

## 1. Designer installieren

Installiere den Designer auf deinem Pekaway-System, wie unter [Auf Pekaway](/installieren/pekaway) beschrieben, und öffne ihn im Browser unter `http://<IP-deines-Pekaway-Systems>:3000`.

Das Installationsskript richtet auch die VanPi-Brücke ein. Sie legt die Werte deines Vans auf den Broker, und die Bausteine finden sie dort.

## 2. Das Board vorbereiten

Ein neues Board bespielst du einmal über USB mit dem <a href="/schaltli-designer/flasher/" target="_self">Flasher</a>. Du brauchst dafür Chrome oder Edge auf einem Computer, die Einzelheiten stehen unter [Firmware flashen](/geraete/flashen).

Danach zeigt das Board einen QR-Code und öffnet ein eigenes WLAN, beim 4.3B heisst es `waveshare-touch-lcd-4v3b-setup`, das Passwort ist `schaltli12345`. Scanne den QR-Code mit dem Handy, dann verbindet es sich mit diesem WLAN und öffnet die Einrichtungsseite von selbst.

1. Wähle im Tab <span class="ui fw">WiFi Setup</span> das WLAN im Van, gib das Passwort ein und tippe auf <span class="ui fw">Save WiFi Settings</span>.
2. Trag im Tab <span class="ui fw">MQTT Connection</span> unter <span class="ui fw">Host</span> die IP-Adresse deines Pekaway-Systems ein, <span class="ui fw">Port</span> bleibt bei 1883. Tippe auf <span class="ui fw">Save MQTT Settings</span>.
3. Tippe unten auf <span class="ui fw">Cancel and restart</span>. Der Name täuscht: Deine gespeicherten Einstellungen bleiben erhalten, das Board verlässt nur den Einrichtungsmodus und startet neu.

<!-- handbuch-macke #14: Cancel and restart klingt nach Verwerfen, und Save WiFi Settings sagt nur "Restart to connect" -->

Mehr zu den Einstellungen, etwa wann das Display ausgeht, steht unter [WLAN und MQTT einrichten](/geraete/einrichten). Das Board verbindet sich jetzt mit deinem WLAN und meldet sich beim Broker an. Es zeigt noch kein Projekt, das kommt im nächsten Schritt.

## 3. Ein Projekt anlegen

Die Startseite des Designers zeigt alle Geräte, für die du ein Projekt anlegen kannst. Unter <span class="ui">Server DDFs</span> stehen die Geräte, die der Designer mitbringt, unter <span class="ui">Announced Devices</span> die, die sich gerade beim Broker melden. Dein Board findest du an beiden Stellen.

<Screenshot name="start" alt="Die Startseite des Designers mit den Gerätekarten" caption="Die Startseite: jedes Gerät eine Karte." />

Klicke doppelt auf die Karte des Waveshare 4.3B. Der Editor öffnet sich mit einem leeren Screen in der Grösse des Displays, 800 × 480 Pixel.

<Screenshot name="editor" alt="Der leere Editor mit Werkzeugleiste, Screen-Liste, Canvas und Eigenschaften" caption="Oben die Werkzeuge, links die Screens, in der Mitte der Screen im Rahmen des Geräts, rechts Objekte und Eigenschaften." />

## 4. Bausteine auf den Screen setzen

Bausteine sind fertige Elemente, die schon wissen, woher ihre Werte kommen. Ganz rechts in der Werkzeugleiste öffnet <span class="ui">Block</span> die Auswahl.

<Screenshot narrow name="baustein-menue" alt="Das geöffnete Block-Menü mit Tank, Battery, Switch und Dimmer" />

Wähle <span class="ui">Tank</span> und zieh auf dem Screen ein Rechteck auf, so gross, wie die Anzeige werden soll. Der Designer fragt den Broker, welche Tanks dein Van hat, und zeigt sie mit ihren Namen. Wähle einen aus.

<Screenshot narrow name="baustein-tank" alt="Der Dialog Insert Tank mit den Tanks des Vans" caption="Die Tanks, wie die VanPi-Brücke sie meldet." />

Setz genauso eine <span class="ui">Battery</span>, einen <span class="ui">Switch</span> für ein Licht und einen <span class="ui">Dimmer</span> daneben. Dann sieht dein Screen etwa so aus:

<Screenshot name="screen-fertig" alt="Der Screen mit Tankanzeige, Batterie, Lichtschalter und Dimmer" />

Die Zahlen im Editor sind Beispielwerte, damit du siehst, wie die Anzeige wirkt. Die echten Werte kommen erst in der Vorschau oder auf dem Gerät.

## 5. In der Vorschau prüfen

Klicke oben rechts auf <span class="ui">Preview</span>. Die Vorschau verbindet sich mit dem Broker und zeigt die echten Werte deines Vans. Rechts stehen unter <span class="ui">MQTT Topic Values</span> alle Werte, die der Screen gerade liest.

<Screenshot name="vorschau-live" alt="Die Live-Vorschau mit den echten Werten des Vans" caption="Live: der tatsächliche Füllstand und Ladezustand." />

::: warning In der Live-Vorschau wird wirklich geschaltet
Tippst du in der Vorschau auf den Schalter, geht das Licht im Van tatsächlich an oder aus. Zum gefahrlosen Ausprobieren wechsle oben in der Liste auf <span class="ui">Simulation</span>.
:::

<span class="ui">Exit Preview</span> bringt dich zurück in den Editor.

## 6. Aufs Board übertragen

Öffne <span class="ui">File</span> › <span class="ui">Deploy to Device</span>. Der Dialog zeigt alle Boards dieses Typs, die sich beim Broker gemeldet haben. Sie heissen nach Gerätetyp und einer Kennung, etwa `waveshare-touch-lcd-4v3b-0a1b2c3d4e5f`. Wähle deines aus.

Unter <span class="ui">Firmware</span> siehst du, welche Firmware das Board hat und ob der Designer eine neuere mitbringt. Stimmen beide überein, steht dort <span class="ui">Up to date with the release.</span>

<Screenshot narrow name="deploy-dialog" alt="Der Dialog Deploy to Device mit dem ausgewählten Board" />

Klicke auf <span class="ui">Deploy</span>. Das Board lädt das Projekt herunter, prüft es und startet neu. Der Dialog zeigt jeden Schritt. Bei <span class="ui">Rebooting</span> ist die Übertragung durch.

<Screenshot narrow name="deploy-fertig" alt="Der Dialog meldet Rebooting: die Übertragung ist abgeschlossen" />

Nach dem Neustart zeigt das Board deinen Screen, mit den Werten deines Vans. Tippst du auf den Schalter, geht das Licht an.

## Wie es weitergeht

- Ohne Board kannst du Screens auch nur [in der Vorschau ausprobieren](/einfuehrung/ausprobieren).
- Ein [altes Android-Handy](/geraete/android) wird mit der Schaltli-App zum zweiten Bedienteil.
- Jede Änderung überträgst du genauso: im Designer ändern, dann wieder <span class="ui">Deploy to Device</span>.
