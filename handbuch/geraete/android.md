# Android-App

Ein altes Android-Handy oder -Tablet wird mit der Schaltli-App zum Bedienteil im Van. Du brauchst Android 8.0 oder neuer, WLAN und ein Ladekabel, das dauerhaft angeschlossen bleibt. Flashen und löten musst du nichts.

## Was die App tut

Die App zeigt deine Screens bildschirmfüllend und reagiert auf Berührungen wie die Boards. Der Bildschirm bleibt an, die Leisten von Android verschwinden, und die App heftet sich selbst an, damit niemand sie versehentlich verlässt. Als Startbildschirm eingerichtet, startet sie nach jedem Neustart von selbst, siehe [unten](#als-festes-bedienteil-schaltli-startet-von-selbst).

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

## Als festes Bedienteil: Schaltli startet von selbst

Hängt das Handy fest im Van, soll es nach einem Stromausfall oder Neustart ohne dein Zutun wieder Schaltli zeigen. Dafür machst du Schaltli zum Startbildschirm des Handys, also zu der App, die Android nach dem Einschalten und bei der Home-Taste öffnet. Das geht ab Version 0.2.0 der App.

1. Halte in Schaltli den Finger fünf Sekunden auf den Bildschirm, bis die Einstellungen erscheinen.
2. Tippe ganz unten auf <span class="ui fw">Choose home app…</span>. Android öffnet seine Auswahl für den Standard-Startbildschirm.
3. Wähle Schaltli.

Ab jetzt startet das Handy nach jedem Neustart direkt in Schaltli, und die Home-Taste führt immer zu Schaltli zurück. Die Einstellungen zeigen das mit <span class="ui fw">Schaltli is this phone's home app</span>.

Als Startbildschirm heftet sich die App nicht mehr selbst an. Android würde sonst nach jedem Neustart fragen, ob sie angeheftet werden soll, und im leeren Van tippt niemand auf Bestätigen. Das Anheften braucht es hier auch nicht, weil jeder Weg aus der App über die Home-Taste wieder zurückführt.

::: warning Bildschirmsperre ausschalten
Ist auf dem Handy eine PIN, ein Muster oder ein Passwort eingerichtet, zeigt Android nach einem Neustart zuerst die Sperre, und Schaltli startet erst, wenn jemand entsperrt. Stell die Bildschirmsperre in den Android-Einstellungen unter Sicherheit auf «Keine».
:::

**Zurück zum normalen Handy:** Halte fünf Sekunden auf den Bildschirm, tippe auf <span class="ui fw">Choose home app…</span> und wähle deinen gewohnten Startbildschirm. Findest du den Knopf nicht, geht es auch über die Android-Einstellungen, meist unter Apps › Standard-Apps › Startbildschirm.

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
