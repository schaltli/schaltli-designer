# Fehlersuche

Nach Symptom geordnet. Oft hilft schon der Blick auf den Broker: `mosquitto_sub -h localhost -t 'schaltli/#' -v` auf dem Pekaway-System zeigt, was bei Schaltli passiert, siehe [MQTT-Broker](/betrieb/mqtt#mithoeren).

## Der Designer

**Der Designer lässt sich nicht öffnen.**
Nimm die IP-Adresse des Pekaway-Systems mit Port 3000, `http://<IP>:3000`. Wartet das System auf Port 3000? `systemctl status schaltli-designer.socket` auf dem Pekaway-System zeigt es. Der Designer selbst startet erst beim ersten Aufruf; ob er dabei einen Fehler hatte, zeigt `systemctl status schaltli-designer`.

**<span class="ui">Deploy to Device</span> fehlt im Menü.**
Der Designer wurde ohne `NEXT_PUBLIC_DEPLOY_ENABLED=true` in `.env.local` gebaut. Trag die Zeile ein und führe das Installationsskript noch einmal aus, es baut dann neu.

**Unter dem Screen steht, das Gerät sei auf diesem Designer nicht verfügbar.**
Das Projekt wurde für ein Gerät angelegt, das dieser Designer nicht kennt. Er öffnet es trotzdem, mit der Beschreibung, die im Projekt steckt. Unter <span class="ui">Settings</span> › <span class="ui">Device</span> kannst du dem Projekt mit <span class="ui">Load Device</span> ein Gerät geben, das dieser Designer kennt.

**Das Block-Menü ist leer.**
Das Menü sagt, wo es gesucht hat. Steht dort «No broker at», erreicht der Browser den Broker nicht auf Port 9001, siehe [MQTT-Broker](/betrieb/mqtt). Steht dort «Nothing announces itself under», kündigt auf dem Broker kein Gerät etwas an, oder unter einem anderen Präfix, siehe [Bausteine](/designer/bausteine). Auf einem Pekaway-System kündigt die VanPi-Brücke an. Fehlt sie oder ist sie zu alt, richtet das Installationsskript sie neu ein, siehe [VanPi-Brücke](/betrieb/vanpi-bruecke#wenn-keine-werte-kommen).

## Ein Gerät

**Ein neues Board taucht nirgends auf.**
Es braucht erst die Firmware über USB, siehe [Firmware flashen](/geraete/flashen), und dann WLAN und Broker, siehe [Einrichten](/geraete/einrichten).

**Das Board zeigt «WLAN nicht erreichbar».**
Das WLAN aus der Einrichtung ist nicht in Reichweite oder hat sich geändert. Bring das Board mit der Geste zurück in die [Einrichtung](/geraete/einrichten#spaeter-wieder-in-die-einrichtung) und trag das WLAN neu ein.

**Das Gerät ist im WLAN, aber nicht im Designer.**
Es erreicht den Broker nicht. Prüfe in der Einrichtung, ob unter <span class="ui fw">Host</span> die IP-Adresse des Pekaway-Systems steht und der Port 1883 ist.

**Das Gerät zeigt keine Werte, nur leere Anzeigen.**
Leere Anzeigen heissen: Auf dem Topic ist noch kein Wert angekommen, siehe [Noch kein Wert](/objekte/gemeinsames#kein-wert). Prüfe mit `mosquitto_sub`, ob unter `schaltli/state/…` Werte liegen.

**Ein Schalter springt zurück.**
Die Anlage hat den Befehl nicht ausgeführt oder meldet einen anderen Zustand. Der Schalter zeigt immer, was die Anlage meldet. Prüfe, ob das Topic zum Schreiben stimmt und ob die VanPi-Brücke läuft.

## Übertragen

**Mein Gerät steht mit <span class="ui">Other device</span> in der Liste.**
Das Projekt wurde für einen anderen Gerätetyp angelegt. Wähl das Gerät und stell das Projekt mit <span class="ui">Switch this project to</span> darauf um, siehe [Ein anderes Gerät](/designer/deploy#ein-anderes-gerat).

**Mein Gerät steht mit <span class="ui">offline</span> in der Liste, oder gar nicht.**
Es ist nicht mit dem Broker verbunden. Prüf, dass es eingeschaltet ist, im selben Netz hängt wie der Designer und als Broker die Adresse eingetragen hat, die der Dialog nennt. Ein Handy, das das WLAN gewechselt hat, meldet sich manchmal erst richtig an, wenn du die App einmal schliesst und neu öffnest.

**<span class="ui">The device did not respond</span>**
Das Gerät hat auf den Auftrag nicht reagiert. Der Designer hat ihn zurückgenommen, es wird also nichts später nachgeholt. Prüf das Gerät und versuch es mit <span class="ui">Try again</span> noch einmal.

**<span class="ui">Failed</span> mit «Download failed».**
Das Gerät hat das Projekt nicht vom Designer laden können. Die Geräte laden es über die Adresse des Designers im lokalen Netz. Läuft der Designer auf einem Rechner mit mehreren Netzwerken oder einem VPN, kann er eine Adresse wählen, die das Gerät nicht erreicht.

**Der Dialog überträgt nicht und nennt einen Grund.**
Das Gerät kann das Projekt nicht ganz zeigen. Was zu tun ist, steht dabei, siehe [Wenn der Dialog nicht überträgt](/designer/deploy#wenn-der-dialog-nicht-ubertragt).

## Flashen

**Der Browser bietet keinen Anschluss an.**
Nimm Chrome oder Edge auf einem Computer. Prüfe, ob das Kabel Daten überträgt. Beim Knob dreh den USB-C-Stecker um.

**Das Flashen bricht ab oder das Board startet danach nicht.**
Flashe noch einmal mit <span class="ui fw">Erase the whole chip first.</span> Prüfe, ob du das richtige Board gewählt hast. Mehr unter [Firmware flashen](/geraete/flashen#wenn-es-nicht-klappt).

## Wenn nichts hilft

Beschreib das Problem in einem [Issue auf GitHub](https://github.com/schaltli/schaltli-designer/issues), mit der Ausgabe von `curl http://<IP>:3000/api/version` und, falls es ein Gerät betrifft, dessen Typ.
