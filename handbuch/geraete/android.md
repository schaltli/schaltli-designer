# Android-App

Ein altes Android-Handy oder -Tablet wird mit der Schaltli-App zum Bedienteil im Van. Du brauchst Android 8.0 oder neuer, WLAN und ein Ladekabel, das dauerhaft angeschlossen bleibt. Flashen und löten musst du nichts.

## Was die App tut

Die App zeigt deine Screens bildschirmfüllend und reagiert auf Berührungen wie die Boards. Der Bildschirm bleibt an, die Leisten von Android verschwinden, und die App heftet sich selbst an, damit niemand sie versehentlich verlässt. Als Startbildschirm eingerichtet, startet sie nach jedem Neustart von selbst, siehe [Als festes Bedienteil im Van](#als-festes-bedienteil-im-van).

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

Beim ersten Start zeigt die App <span class="ui fw">Dieses Telefon hat noch kein Projekt.</span>

1. Tippe auf <span class="ui fw">MQTT-Verbindung einrichten…</span>.
2. Trag unter <span class="ui fw">Host</span> die IP-Adresse deines Pekaway-Systems ein. <span class="ui fw">Port</span> bleibt bei 1883. Benutzername und Passwort brauchst du nur, wenn dein Broker welche verlangt; ein Pekaway-System tut das nicht.
3. <span class="ui fw">Test</span> prüft die Verbindung und meldet <span class="ui fw">Connected to</span> mit Adresse und Port.
4. <span class="ui fw">Save & Connect</span> speichert die Einstellungen und verbindet.

Das Handy erscheint jetzt im Designer auf der Startseite unter <span class="ui">Announced Devices</span>. Leg dort ein Projekt dafür an, gestalte deine Screens und schick sie mit <span class="ui">Deploy to Device</span> aufs Handy.

Später kommst du wieder in diese Einstellungen, indem du den Finger fünf Sekunden auf den Bildschirm hältst. Nach einer Sekunde erscheint ein Countdown. Lässt du vorher los, passiert nichts.

Neue Versionen installierst du genauso, über die bestehende App hinweg. Deine Einstellungen bleiben dabei erhalten, weil jede Version mit demselben Schlüssel signiert ist.

## Als festes Bedienteil im Van

Hängt das Handy fest im Van, soll es nach einem Stromausfall oder Neustart ohne dein Zutun wieder Schaltli zeigen, und niemand soll erst eine PIN eingeben müssen. Das geht in drei Schritten. Lies vorher den ersten, er ist der wichtigste.

### 1. Keine persönlichen Daten auf dem Handy

Ein Handy ohne PIN öffnet jedem, der es in die Hand nimmt, alles, was darauf ist: Mails, Fotos, Dokumente, gespeicherte Passwörter, Zahlungsdaten. Ein Bedienteil im Van darf deshalb **mit keinem persönlichen Konto verbunden** sein.

Am saubersten ist ein frischer Start:

1. Entferne zuerst dein Google-Konto: Einstellungen › Konten (bei Huawei «Konten» oder «Benutzer und Konten») › Google › Konto entfernen. Tu das vor dem Zurücksetzen. Sonst verlangt das Handy danach zum Schutz vor Diebstahl das Passwort dieses Kontos, bevor es sich neu einrichten lässt.
2. Setz das Handy auf Werkseinstellungen zurück, meist unter System › Zurücksetzen.
3. Überspring bei der neuen Einrichtung die Anmeldung bei Google. Die Schaltli-App braucht kein Konto, die APK lädst du im Browser.

Willst du nicht zurücksetzen, entferne mindestens alle Konten unter Einstellungen › Konten, bei Huawei auch die Huawei-ID, und deinstalliere Apps mit persönlichen Daten: Messenger, Mail, Banking, Passwort-Manager, Fotos.

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

Manche Handys zeigen auch ohne PIN noch einen Sperrbildschirm, den man nach oben wegwischen muss.

## Gut zu wissen

- Ohne die Einstellung als Startbildschirm startet die App nach einem Neustart des Handys nicht von selbst. Öffne sie dann einmal von Hand.
- Wird die App neu installiert, bekommt das Handy eine neue Kennung. Im Designer ist es dann ein neues Gerät, und du überträgst dein Projekt noch einmal.
- Ein Projekt legt fest, wie das Handy gedreht ist: hochkant oder quer.

## Tipp: LineageOS für sehr alte Handys

Ein Handy, das vom Hersteller keine Updates mehr bekommt, lässt sich oft mit [LineageOS](https://lineageos.org) weiterbetreiben. Das ist ein freies Android, das für viele ältere Geräte aktuelle Versionen und Sicherheitsupdates liefert. Welche Geräte unterstützt werden, steht im [LineageOS-Wiki](https://wiki.lineageos.org/devices/).

LineageOS kommt ohne Google-Dienste. Für Schaltli ist das kein Nachteil, denn die App braucht keine.

::: warning Vorher sichern
Um LineageOS zu installieren, entsperrst du den Bootloader, und dabei werden alle Daten auf dem Handy gelöscht. Folge genau der Anleitung für dein Modell im LineageOS-Wiki.
:::
