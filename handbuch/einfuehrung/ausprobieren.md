# Ohne Gerät ausprobieren

Für die ersten Screens brauchst du kein Display. Der Designer bringt die Beschreibungen aller unterstützten Geräte mit, und seine Vorschau zeigt dir im Browser, wie dein Screen auf dem Gerät aussieht und reagiert. Ein Board kaufen kannst du immer noch, wenn dir gefällt, was du siehst.

Du brauchst nur den [installierten Designer](/installieren/pekaway), auf deinem Pekaway-System oder zum Ausprobieren auch [auf dem eigenen Rechner](/installieren/ohne-pekaway).

## Ein Projekt für ein Gerät, das du nicht hast

Öffne den Designer und klick auf der Startseite <span class="ui">Welcome to Schaltli</span> auf <span class="ui">New Project...</span>. Der Dialog zeigt unter <span class="ui">Server DDFs</span> die Geräte, die der Designer kennt. Ob eines davon bei dir liegt, spielt keine Rolle. Klicke doppelt auf eines, etwa den Waveshare 4.3B, gib dem Projekt einen Namen und klick auf <span class="ui">Create Project</span>. Der Editor öffnet sich mit einem leeren Screen in der richtigen Grösse.

Gespeichert wird nicht von selbst: <kbd>Strg</kbd>+<kbd>S</kbd> speichert, siehe [Projekte](/designer/projekte#speichern).

Ein Projekt ist fest an seinen Gerätetyp gebunden. Wähle deshalb gleich das Gerät, das du später am ehesten nimmst. Der Screen eines runden Knobs mit 360 × 360 Pixeln lässt sich nicht einfach auf ein breites Display mit 800 × 480 übertragen.

## Einen Screen bauen

Am schnellsten geht es mit den Bausteinen. In der Werkzeugleiste öffnet <span class="ui">Block</span> eine Auswahl fertiger Elemente, nämlich <span class="ui">Tank</span>, <span class="ui">Battery</span>, <span class="ui">Switch</span> und <span class="ui">Dimmer</span>. Wähle einen, zieh auf dem Screen ein Rechteck auf und such dir im folgenden Dialog einen Eintrag aus. Der Baustein bringt seine Topics und Beispielwerte gleich mit.

## Die Vorschau

Oben rechts startet <span class="ui">Preview</span> die Vorschau. Der Screen verhält sich jetzt wie auf dem Gerät: Schalter lassen sich antippen, Dimmer ziehen, Buttons wechseln den Screen. Rechts steht die Liste <span class="ui">MQTT Topic Values</span> mit allen Werten, die dein Screen gerade anzeigt. <span class="ui">Exit Preview</span> bringt dich zurück in den Editor.

Die Vorschau kennt zwei Quellen für ihre Werte, und oben in der Liste wählst du, welche:

- <span class="ui">Simulation</span> zeigt die Beispielwerte, die zu jedem Topic gehören, beim Tank-Baustein etwa 45 %. Tippe einen anderen Wert in die Liste, und der Screen zeigt ihn sofort. Veröffentlicht wird nichts. Findet der Designer keinen Broker, schaltet er von selbst auf Simulation.
- <span class="ui">Live</span> verbindet sich mit dem Broker und zeigt, was dort wirklich ankommt. Auf einem Pekaway-System mit VanPi-Brücke sind das die echten Werte deines Vans: Du siehst den tatsächlichen Wasserstand, bevor überhaupt ein Display im Van hängt.

::: warning In der Live-Vorschau wird wirklich geschaltet
Wer in der Live-Vorschau einen Schalter antippt, veröffentlicht den Befehl auf dem Broker. Hängt das Topic an einem Relais, geht das Licht im Van tatsächlich an. Zum gefahrlosen Ausprobieren nimm <span class="ui">Simulation</span>.
:::

## Und dann?

Wenn dir der Screen gefällt, fehlt nur noch ein Gerät, das ihn anzeigt. Das günstigste liegt vielleicht schon in deiner Schublade: [ein altes Android-Handy](/einfuehrung/#ein-altes-handy-aus-der-schublade).
