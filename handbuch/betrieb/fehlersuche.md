# Fehlersuche

Nach Symptom geordnet. Oft hilft schon der Blick auf den Broker: `mosquitto_sub -h localhost -t 'schaltli/#' -v` auf dem Pekaway-System zeigt, was bei Schaltli passiert, siehe [MQTT-Broker](/betrieb/mqtt#mithoeren).

## Der Designer

**Der Designer lässt sich nicht öffnen.**
Nimm die IP-Adresse des Pekaway-Systems mit Port 3000, `http://<IP>:3000`. Der Name `schaltli.peka.way`, den das Installationsskript am Ende nennt, funktioniert noch nicht. Läuft der Dienst? `systemctl status schaltli-designer` auf dem Pekaway-System zeigt es.

**<span class="ui">Deploy to Device</span> fehlt im Menü.**
Nach der ersten Installation führe das Installationsskript ein zweites Mal aus, siehe [Installation](/installieren/pekaway#installieren).

**Unter dem Screen steht, das Gerät sei auf diesem Designer nicht verfügbar.**
Das Projekt wurde für ein Gerät angelegt, das dieser Designer nicht kennt. Er öffnet es trotzdem, mit der Beschreibung, die im Projekt steckt. Unter <span class="ui">Settings</span> › <span class="ui">Device</span> kannst du dem Projekt mit <span class="ui">Load Device</span> ein Gerät geben, das dieser Designer kennt.

**Die Bausteine finden keine Werte.**
Der Dialog sagt, wo er gesucht hat. Steht dort «No broker at», erreicht der Browser den Broker nicht auf Port 9001, siehe [MQTT-Broker](/betrieb/mqtt). Findet er den Broker, aber keine Werte, liefert die VanPi-Brücke nichts, siehe [VanPi-Brücke](/betrieb/vanpi-bruecke#wenn-keine-werte-kommen).

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

**Der Dialog findet kein Gerät für dieses Projekt.**
Er zeigt nur Geräte desselben Typs wie das Projekt. Er nennt, welche Geräte sich stattdessen melden. Passt eines davon, wurde das Projekt für einen anderen Gerätetyp angelegt; unter <span class="ui">Settings</span> › <span class="ui">Device</span> gibst du ihm das richtige.

**<span class="ui">Offline - will apply automatically when the device reconnects</span>**
Das Gerät ist gerade nicht online. Das Projekt wartet auf dem Broker und wird übernommen, sobald das Gerät wieder da ist.

**<span class="ui">Failed</span> mit «Download failed».**
Das Gerät hat das Projekt nicht vom Designer laden können. Die Geräte laden es über die Adresse des Designers im lokalen Netz. Läuft der Designer auf einem Rechner mit mehreren Netzwerken oder einem VPN, kann er eine Adresse wählen, die das Gerät nicht erreicht.

**Der Dialog verlangt zuerst ein Firmware-Update.**
Die Firmware des Geräts ist zu alt für dieses Projekt. Aktualisiere sie im selben Dialog, siehe [Firmware-Updates](/geraete/firmware-updates).

## Flashen

**Der Browser bietet keinen Anschluss an.**
Nimm Chrome oder Edge auf einem Computer. Prüfe, ob das Kabel Daten überträgt. Beim Knob dreh den USB-C-Stecker um.

**Das Flashen bricht ab oder das Board startet danach nicht.**
Flashe noch einmal mit <span class="ui fw">Erase the whole chip first.</span> Prüfe, ob du das richtige Board gewählt hast. Mehr unter [Firmware flashen](/geraete/flashen#wenn-es-nicht-klappt).

## Wenn nichts hilft

Beschreib das Problem in einem [Issue auf GitHub](https://github.com/Matthias-Hess/schaltli-designer/issues), mit der Ausgabe von `curl http://<IP>:3000/api/version` und, falls es ein Gerät betrifft, dessen Typ.
