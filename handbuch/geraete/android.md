# Android-App

Ein altes Android-Handy oder -Tablet wird mit der Schaltli-App zum Bedienteil im Van. Du brauchst Android 8.0 oder neuer, WLAN und ein Ladekabel, das dauerhaft angeschlossen bleibt. Flashen und löten musst du nichts.

## Was die App tut

Die App zeigt deine Screens bildschirmfüllend und reagiert auf Berührungen wie die Boards. Die Leisten von Android verschwinden, und die App heftet sich selbst an, damit niemand sie versehentlich verlässt. Nach einer Weile ohne Berührung wird das Display dunkel, siehe [Display](#display). Als Startbildschirm eingerichtet, startet sie nach jedem Neustart von selbst, siehe [Als festes Bedienteil im Van](#als-festes-bedienteil-im-van).

Sobald die App den Broker kennt, meldet sie sich dort an und teilt dem Designer mit, wie gross ihr Display ist. Im Designer erscheint das Handy dann unter seinem Namen, etwa «HUAWEI P20 Pro», als eigenes Gerät. Du baust die Screens also genau für dieses Display. Neue Projekte schickst du wie bei den Boards mit <span class="ui">Deploy to Device</span>, und die App übernimmt sie ohne Neustart.

## Warum nicht im Play Store?

Die App wird direkt als Installationsdatei (APK) verteilt, nicht über den Google Play Store. Das passt zu dem, wofür sie gedacht ist:

- Sie ist ein Bedienteil für eine einzige Anlage, keine App für ein breites Publikum. Wer sie braucht, hat ohnehin schon den Designer und einen Broker.
- Manche alten Handys laufen mit einem Android ohne Google-Dienste, etwa LineageOS, und haben damit keinen Play Store. Eine APK lässt sich trotzdem installieren, und die App braucht keine Google-Dienste.
- Der Quellcode ist offen: [schaltli-android auf GitHub](https://github.com/Matthias-Hess/schaltli-android). Du kannst nachsehen, was die App tut, und sie selbst bauen.

## Installieren

1. Öffne auf dem Handy die [neueste Version auf der Releases-Seite](https://github.com/Matthias-Hess/schaltli-android/releases/latest) und lade die Datei `schaltli-v….apk` herunter.
2. Öffne die heruntergeladene Datei. Android fragt, ob der Browser Apps installieren darf. Erlaube es für diesen einen Fall. Wo genau die Einstellung sitzt, hängt vom Hersteller ab, meist heisst sie «Unbekannte Apps installieren».
3. Installiere die App und öffne sie.
4. Beim ersten Start fragt Android, ob die App angeheftet werden soll. Bestätige das. Auf manchen Handys musst du das Anheften vorher in den Einstellungen unter Sicherheit einschalten; es heisst dort «Bildschirmfixierung» oder «App anpinnen».

## Mit dem Broker verbinden

Beim ersten Start zeigt die App <span class="ui fw">This phone has no project yet.</span> Wie die Boards ist sie englisch beschriftet. Solange sie noch kein Projekt hat, dreht sich dieser Bildschirm mit dem Handy.

1. Tippe auf <span class="ui fw">Set up MQTT connection…</span>.
2. Trag unter <span class="ui fw">Host</span> die IP-Adresse deines Pekaway-Systems ein. <span class="ui fw">Port</span> bleibt bei 1883. Benutzername und Passwort brauchst du nur, wenn dein Broker welche verlangt; ein Pekaway-System tut das nicht.
3. <span class="ui fw">Test</span> prüft die Verbindung und meldet <span class="ui fw">Connected to</span> mit Adresse und Port.
4. <span class="ui fw">Save & Connect</span> speichert die Einstellungen und verbindet.

Das Handy erscheint jetzt im Designer unter <span class="ui">Announced Devices</span>, wenn du mit <span class="ui">New Project...</span> ein Projekt anlegst. Leg dort ein Projekt dafür an, gestalte deine Screens und schick sie mit <span class="ui">Deploy to Device</span> aufs Handy.

Reisst die Verbindung zum Broker ab, verbindet sich die App von selbst wieder. Was du in der Zwischenzeit antippst, schickt sie nicht und hebt es auch nicht für später auf. Kurz erscheint <span class="ui fw">Not connected - nothing was sent</span>. So schaltet nicht Stunden später eine Pumpe ein, die du längst vergessen hast. Die Boards halten es genauso, nur ohne Meldung.

Später kommst du wieder in diese Einstellungen, indem du den Finger fünf Sekunden auf den Bildschirm hältst. Nach einer Sekunde erscheint ein Countdown. Lässt du vorher los, passiert nichts. Die Geste gilt, sobald ein Projekt läuft; davor führt der Knopf <span class="ui fw">Set up MQTT connection…</span> in die Einstellungen.

Neue Versionen installierst du genauso, über die bestehende App hinweg. Deine Einstellungen bleiben dabei erhalten, weil jede Version mit demselben Schlüssel signiert ist.

## Als festes Bedienteil im Van

Hängt das Handy fest im Van, soll es nach einem Stromausfall oder Neustart ohne dein Zutun wieder Schaltli zeigen, und niemand soll erst eine PIN eingeben müssen. Das geht in drei Schritten. Lies vorher den ersten, er ist der wichtigste.

### 1. Keine persönlichen Daten auf dem Handy

Ein Handy ohne PIN öffnet jedem, der es in die Hand nimmt, alles, was darauf ist: Mails, Fotos, Dokumente, gespeicherte Passwörter, Zahlungsdaten. Ein Bedienteil im Van darf deshalb **mit keinem persönlichen Konto verbunden** sein. Dafür gibt es zwei Wege: die Konten entfernen oder das Handy auf Werkseinstellungen zurücksetzen. Das Zurücksetzen ist gründlicher, denn es löscht auch alles, was Apps sonst noch gespeichert haben.

Die Einstellungen erreichst du auch, wenn Schaltli schon der Startbildschirm ist: vom oberen Rand zweimal nach unten wischen, dann auf das Zahnrad tippen.

#### Konten entfernen

1. Öffne Einstellungen › Konten, bei Huawei «Benutzer und Konten».
2. Tippe auf **Google**, dann auf deine Adresse, und wähle «Konto entfernen». Bei Huawei steht es unten auf der Seite oder oben rechts im Menü ⋮. Bestätige.
3. Entferne genauso jedes weitere Konto in der Liste, etwa Mail-Konten oder ein zweites Google-Konto.
4. Melde dich vom Konto des Herstellers ab. Bei Huawei ist das die Huawei-ID: ganz oben in den Einstellungen auf deinen Namen tippen, dann unten «Abmelden». Bei Samsung heisst es Samsung-Konto.
5. Deinstalliere Apps, die persönliche Daten halten, auch ohne Konto im Handy: Messenger wie WhatsApp oder Signal, Mail, Banking, Passwort-Manager, Cloud- und Foto-Apps.

Mit dem Google-Konto verschwindet auch der Diebstahlschutz («Mein Gerät finden»). Für ein Bedienteil ohne persönliche Daten ist das richtig so.

#### Oder: auf Werkseinstellungen zurücksetzen

1. **Entferne zuerst das Google-Konto**, wie oben unter Schritt 2. Das ist wichtig: Ist beim Zurücksetzen noch ein Google-Konto angemeldet, verlangt das Handy danach zum Schutz vor Diebstahl das Passwort genau dieses Kontos und lässt sich ohne es nicht einrichten.
2. Setz das Handy zurück: Einstellungen › System › Zurücksetzen, bei Huawei «Telefon zurücksetzen», bei anderen oft «Alle Daten löschen». Alles auf dem Handy wird gelöscht.
3. Richte das Handy danach neu ein: WLAN wählen, die Anmeldung bei Google überspringen, ebenso die beim Hersteller, und keine PIN einrichten.
4. Lade die Schaltli-App im Browser, wie unter [Installieren](#installieren) beschrieben. Dafür brauchst du kein Konto.

### 2. Schaltli als Startbildschirm

Der Startbildschirm ist die App, die Android nach dem Einschalten und bei der Home-Taste öffnet. Ist das Schaltli, startet das Handy nach jedem Neustart direkt in Schaltli. Das geht ab Version 0.2.0 der App.

::: tip Zuerst den Weg zurück kennen
Als Startbildschirm verdeckt Schaltli alles andere. Zurück kommst du so:
- **In Schaltli:** Finger fünf Sekunden auf den Bildschirm halten, bis die Einstellungen erscheinen, ganz nach unten scrollen und <span class="ui fw">Choose home app…</span> tippen. Android zeigt dann die Auswahl der Startbildschirme, und du wählst deinen gewohnten.
- **Über Android:** vom oberen Bildschirmrand nach unten wischen, bis die Leiste erscheint, noch einmal wischen und auf das Zahnrad tippen. Das sind die normalen Einstellungen.
:::

1. Öffne die Android-Einstellungen, meist Apps › Standard-Apps › Startbildschirm. Du kommst auch aus Schaltli dorthin: Finger fünf Sekunden halten, dann <span class="ui fw">Choose home app…</span>.
2. Wähle Schaltli.

Wähle den Startbildschirm über diese Einstellung. Andere Wege, etwa Befehle über USB, übernehmen manche Hersteller beim nächsten Neustart nicht.

Die Einstellungen in Schaltli zeigen danach <span class="ui fw">Schaltli is this phone's home app</span>. Als Startbildschirm heftet sich die App nicht mehr selbst an. Android würde sonst nach jedem Neustart fragen, ob sie angeheftet werden soll, und im leeren Van tippt niemand auf Bestätigen.

### 3. PIN entfernen

Erst wenn keine persönlichen Daten mehr auf dem Handy sind: Schalte die Bildschirmsperre aus, meist unter Einstellungen › Sicherheit, bei Huawei unter «Biometrie und Passwort» › «Sperrbildschirm-Passwort deaktivieren». Fingerabdruck und Gesichtserkennung verschwinden damit auch.

Solange eine PIN, ein Muster oder ein Passwort gesetzt ist, zeigt Android nach einem Neustart zuerst die Sperre, und Schaltli kommt erst nach dem Entsperren.

Manche Handys zeigen auch ohne PIN noch einen Sperrbildschirm, den man nach oben wegwischen muss. Ab Version 0.3.0 schiebt Schaltli ihn selbst weg, nach jedem Start und jedes Mal, wenn der Bildschirm wieder angeht. Mit PIN, Muster oder Passwort tut die App das nicht: Eine echte Sperre bleibt, wie sie ist.

## Display {#display}

Nach einer Weile ohne Berührung wird das Display schwarz und so dunkel wie möglich. Die nächste Berührung weckt es wieder und tut sonst nichts: Wer nachts nach dem dunklen Handy greift, schaltet damit nicht versehentlich das Licht. So halten es auch die Boards.

Wie lange es dauert, stellst du in den Einstellungen der App ein, unter <span class="ui fw">Turn the display off after (seconds)</span>. Voreingestellt sind 60 Sekunden, 0 lässt das Display immer an. Werte, die über MQTT ankommen, zählen nicht als Berührung. Das geht ab Version 0.4.0 der App.

Ganz aus schaltet die App das Display dabei nicht. Ein ausgeschaltetes Display bemerkt keine Berührung, dann wäre nur noch die Power-Taste ein Weg zurück. Auf Handys mit OLED-Display, wie den meisten neueren, ist Schwarz trotzdem praktisch aus, und es brennt sich nichts ein.

## Gut zu wissen

- Schliess das Handy im Van an ein Ladegerät an, nicht an einen Computer. Am Computer fragt manches Handy nach jedem Start, ob es nur laden oder Daten übertragen soll, und diese Frage steht dann vor Schaltli.
- Ohne die Einstellung als Startbildschirm startet die App nach einem Neustart des Handys nicht von selbst. Öffne sie dann einmal von Hand.
- Wird die App neu installiert, bekommt das Handy eine neue Kennung. Im Designer ist es dann ein neues Gerät, und du überträgst dein Projekt noch einmal.
- Ein Projekt legt fest, wie das Handy gedreht ist: hochkant oder quer.

## Tipp: LineageOS für sehr alte Handys

Ein Handy, das vom Hersteller keine Updates mehr bekommt, lässt sich oft mit [LineageOS](https://lineageos.org) weiterbetreiben. Das ist ein freies Android, das für viele ältere Geräte aktuelle Versionen und Sicherheitsupdates liefert. Welche Geräte unterstützt werden, steht im [LineageOS-Wiki](https://wiki.lineageos.org/devices/).

LineageOS kommt ohne Google-Dienste. Für Schaltli ist das kein Nachteil, denn die App braucht keine.

::: warning Vorher sichern
Um LineageOS zu installieren, entsperrst du den Bootloader, und dabei werden alle Daten auf dem Handy gelöscht. Folge genau der Anleitung für dein Modell im LineageOS-Wiki.
:::
