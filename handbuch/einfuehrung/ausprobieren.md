# Ohne Gerät ausprobieren

Für die ersten Screens brauchst du kein Display. Der Designer bringt die Beschreibungen aller unterstützten Geräte mit, und seine Vorschau zeigt dir im Browser, wie dein Screen auf dem Gerät aussieht und reagiert. Ein Board kaufen kannst du immer noch, wenn dir gefällt, was du siehst.

Du brauchst nur den [installierten Designer](/installieren/pekaway), auf deinem Pekaway-System oder zum Ausprobieren auch [auf dem eigenen Rechner](/installieren/ohne-pekaway).

## Die Demo im Browser {#demo}

Ganz ohne Installation geht es auf [demo.schaltli.com](https://demo.schaltli.com). Dort läuft der Designer mit dem fertigen Projekt «Camper» für den Waveshare 4.3B, und hinter dem Projekt steht ein simulierter Van mit VanPi-Brücke. Links, wo sonst deine Projekte stehen, zeigt <span class="ui">Your van</span> diesen Van als Bild.

Die Demo öffnet in der Vorschau. Das Gerät liegt auf schwarzem Filz und reagiert wie das Display im Van. Schalte auf den Screens «Licht» und «Wasser»: Dimmst du das Innenlicht hoch, leuchtet im Bild das Fenster. Ein Klick auf die Dusche hinter der Tür verbraucht Frischwasser, aber nur, wenn die Wasserpumpe läuft. Ein Klick auf den Einfüllstutzen füllt den Tank mit dem Kanister wieder auf. Der Van gehört allen, die gerade in der Demo sind. Schaltet jemand anderes das Licht ein, siehst du es auch.

Der rote Schalter unter dem Gerät wechselt zwischen <span class="ui">Preview</span> und <span class="ui">Designer</span>. Im Designer stehen die Screens und die Werkzeuge bereit, und du baust am Projekt weiter.

Gespeichert wird in der Demo nichts. Was du gebaut hast, nimmst du mit <span class="ui">File</span> › <span class="ui">Download Project</span> als Datei mit und öffnest es später im eigenen Designer mit <span class="ui">Upload Project</span>. <span class="ui">Save</span>, <span class="ui">Deploy to Device</span> und <span class="ui">Version History</span> stehen zwar im Menü, aber ein Klick darauf meldet nur, dass das erst dein eigenes Schaltli kann, und verlinkt die Installation.

### Was die Demo zählt {#demo-zaehlt}

Die Demo zählt mit, wie sie genutzt wird. Sie setzt dafür kein Cookie und speichert deine IP-Adresse nicht. Ein Besuch ist eine zufällige Nummer, die nur so lange gilt, wie der Browser-Tab offen ist.

Gespeichert wird pro Besuch:

- woher du ungefähr kommst: Land und Region, die Stadt nur, wenn sie über 50 000 Einwohner hat. Der Server liest das aus deiner IP-Adresse und vergisst die Adresse gleich wieder;
- von welcher Website du kommst, nur ihr Name, und ob du einen Browser auf dem Handy, dem Tablet oder dem Computer benutzt;
- wie lange du bleibst und was du tust: welche Screens du öffnest, was du schaltest, was du einfügst und ob du ein Projekt herunterlädst.

Die Daten bleiben auf dem Server der Demo und werden nach 30 Tagen gelöscht. Die Ortsangaben stammen aus der Datenbank von [DB-IP](https://db-ip.com).

## Ein Projekt für ein Gerät, das du nicht hast

Öffne den Designer und klick auf der Startseite <span class="ui">Welcome to Schaltli</span> auf <span class="ui">New Project...</span>. Der Dialog zeigt unter <span class="ui">Server DDFs</span> die Geräte, die der Designer kennt. Ob eines davon bei dir liegt, spielt keine Rolle. Klicke doppelt auf eines, etwa den Waveshare 4.3B, gib dem Projekt einen Namen und klick auf <span class="ui">Create Project</span>. Der Editor öffnet sich mit einem leeren Screen in der richtigen Grösse.

Gespeichert wird nicht von selbst: <kbd>Strg</kbd>+<kbd>S</kbd> speichert, siehe [Projekte](/designer/projekte#speichern).

Ein Projekt ist fest an seinen Gerätetyp gebunden. Wähle deshalb gleich das Gerät, das du später am ehesten nimmst. Der Screen eines runden Knobs mit 360 × 360 Pixeln lässt sich nicht einfach auf ein breites Display mit 800 × 480 übertragen.

## Einen Screen bauen

Am schnellsten geht es mit den Bausteinen. In der Werkzeugleiste öffnet <span class="ui">Block</span> eine Auswahl dessen, was die Geräte auf deinem Broker anbieten. Wähle einen Eintrag, klick auf <span class="ui">Insert</span> und zieh auf dem Screen ein Rechteck auf. Der Baustein bringt seine Topics und Beispielwerte gleich mit. Kündigt auf deinem Broker nichts etwas an, setzt du die Objekte von Hand, siehe [Bausteine](/designer/bausteine).

## Die Vorschau

Oben rechts startet <span class="ui">Preview</span> die Vorschau. Der Screen verhält sich jetzt wie auf dem Gerät: Schalter lassen sich antippen, Dimmer ziehen, Buttons wechseln den Screen. Rechts steht die Liste <span class="ui">MQTT Topic Values</span> mit allen Werten, die dein Screen gerade anzeigt. <span class="ui">Exit Preview</span> bringt dich zurück in den Editor.

Die Vorschau kennt zwei Quellen für ihre Werte, und oben in der Liste wählst du, welche:

- <span class="ui">Simulation</span> zeigt die Beispielwerte, die zu jedem Topic gehören. Tippe einen anderen Wert in die Liste, und der Screen zeigt ihn sofort. Veröffentlicht wird nichts. Findet der Designer keinen Broker, schaltet er von selbst auf Simulation.
- <span class="ui">Live</span> verbindet sich mit dem Broker und zeigt, was dort wirklich ankommt. Auf einem Pekaway-System mit VanPi-Brücke sind das die echten Werte deines Vans: Du siehst den tatsächlichen Wasserstand, bevor überhaupt ein Display im Van hängt.

::: warning In der Live-Vorschau wird wirklich geschaltet
Wer in der Live-Vorschau einen Schalter antippt, veröffentlicht den Befehl auf dem Broker. Hängt das Topic an einem Relais, geht das Licht im Van tatsächlich an. Zum gefahrlosen Ausprobieren nimm <span class="ui">Simulation</span>.
:::

## Und dann?

Wenn dir der Screen gefällt, fehlt nur noch ein Gerät, das ihn anzeigt. Das günstigste liegt vielleicht schon in deiner Schublade: [ein altes Android-Handy](/einfuehrung/#ein-altes-handy-aus-der-schublade).
