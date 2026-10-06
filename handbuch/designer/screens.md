# Screens und Master

Ein Projekt besteht aus Screens, zwischen denen man auf dem Gerät wechselt: eine Übersicht, ein Screen fürs Licht, einer für die Heizung. Was auf mehreren Screens gleich sein soll, etwa ein Hintergrund oder eine Statuszeile, legst du einmal auf einen Master-Screen. Was du nur ab und zu brauchst, etwa den Timer der Heizung, kommt auf ein Popup.

## Screens anlegen und ordnen

Links in der Liste <span class="ui">Screens</span> öffnet <span class="ui">+</span> ein kleines Menü: <span class="ui">Add Screen</span>, <span class="ui">Add Master Screen</span> oder <span class="ui">Add Popup Screen</span>. Im Dialog gibst du einen Namen ein. Für normale Screens schlägt der Designer beim Tippen gleich ein passendes Icon vor. Das Icon brauchen Geräte mit Screen-Menü, etwa der [Knob](/geraete/knob). <span class="ui">Create Screen</span> legt den Screen an.

Die Reihenfolge änderst du, indem du die Vorschaubilder in der Liste verschiebst. Sie ist auch die Reihenfolge, in der <span class="ui">Next screen</span> und <span class="ui">Previous screen</span> blättern.

Fährst du mit der Maus über ein Vorschaubild, erscheint ein Menü mit <span class="ui">Duplicate</span> und <span class="ui">Delete</span>. Löschen geschieht ohne Rückfrage, <kbd>Strg</kbd>+<kbd>Z</kbd> holt den Screen zurück. Den letzten Screen kannst du nicht löschen, ebenso wenig einen Master, den noch Screens verwenden.

<span class="ui">Manage Screens</span> unten in der Liste zeigt alle Screens mit ihren Einstellungen in einer Tabelle.

## Master-Screens

Die Objekte eines Master-Screens erscheinen auf jedem Screen, der ihn verwendet. Bearbeiten kannst du sie nur auf dem Master selbst. Auch das [Theme](/designer/themes), die Hintergrundfarbe und die Belegung der [Hardware-Tasten](/designer/tasten) erbt ein Screen von seinem Master.

Ein Master ist selbst nie auf dem Gerät zu sehen. Er ist kein Ziel für <span class="ui">Go to a screen</span>, und beim Blättern wird er übersprungen.

Jeder Screen hat einen Master, denn von ihm bekommt er sein Theme und seine Typografie. Ein neuer Screen bekommt den Master, den du gerade vor dir hast: den Master, der offen ist, oder den Master des Screens, der offen ist. Einen Master, den noch Screens verwenden, kannst du nicht löschen, und den letzten auch nicht.

## Popups {#popups}

Ein Popup ist ein Screen, der sich auf Knopfdruck über den aktuellen legt. Tippst du daneben, ist es wieder weg. Es passt für das, was du selten brauchst und was den Screen sonst überladen würde.

Du gestaltest ein Popup wie jeden Screen, in voller Grösse. Der Designer zeichnet darauf einen violetten Umriss, auf einem runden Gerät einen Kreis, sonst ein Rechteck. Innen liegen 80 Prozent der Bildschirmfläche, und das ist das Fenster. Was du ausserhalb hinsetzt, zeichnet das Gerät zwar auch, aber neben das Fenster. Der Designer blendet es deshalb ab, verbieten tut er es nicht.

Ein Button oder eine Taste mit <span class="ui">Open a popup</span> öffnet das Popup, siehe [Hardware-Tasten und Gesten](/designer/tasten). Mehrere Buttons auf verschiedenen Screens dürfen dasselbe Popup öffnen. Zu geht es

- mit einem Tipp neben das Fenster,
- mit einer Wischgeste, ausser du ziehst gerade an einem Slider oder Dial im Popup,
- mit einem Button oder einer Taste mit <span class="ui">Close this popup</span>.

Danach bist du wieder auf dem Screen, von dem aus du es geöffnet hast. Wie das Fenster genau aussieht, entscheidet das Gerät, zum Beispiel ein abgedunkelter Hintergrund oder ein Schatten.

Ein Popup steht nicht in der Reihenfolge von <span class="ui">Next screen</span> und <span class="ui">Previous screen</span> und ist kein Ziel für <span class="ui">Go to a screen</span>. Es hat einen Master, aber nur für Theme und Typografie. Die Objekte und die Tastenbelegung des Masters übernimmt es nicht.

Mit <span class="ui">Screen type</span> in den Eigenschaften machst du aus einem Screen ein Popup und umgekehrt. Ein Screen, der zum Popup wird, verliert seine Wischgesten. Löschst du ein Popup, das Buttons noch öffnen, tun diese Buttons nichts mehr.

::: warning Noch nicht jedes Gerät kennt Popups
<!-- handbuch-macke #50: Knob, PaperS3 und Android öffnen keine Popups -->
Popups öffnen sich in der [Vorschau](/designer/vorschau) und auf dem [Waveshare 4.3B](/geraete/waveshare-4-3b). Auf dem Knob, dem PaperS3 und in der Android-App tut ein Button mit <span class="ui">Open a popup</span> noch nichts.
:::

## Ein Screen ist frei {#layout}

Was du auf einen Screen setzt, bleibt dort, wo du es hinsetzt. Willst du Namen und Bedienelemente bündig untereinander, setzt du eine [Tabelle](/objekte/anordnen#container) auf den Screen: mit dem Werkzeug <span class="ui">Table</span> oder mit einem [Baustein](/designer/bausteine), der seine Tabelle gleich mitbringt. Den nächsten Baustein hängst du mit dem <span class="ui">+</span> unter der Tabelle an.

Projekte, in denen ein Screen noch selbst eine Tabelle war oder ein Master einen Inhaltsbereich hatte, öffnet der Designer so, dass alles bleibt, wo es war. Aus der Tabelle des Screens wird eine Tabelle auf dem Screen, an derselben Stelle. Den Inhaltsbereich gibt es nicht mehr.

## Die Eigenschaften eines Screens

Ist nichts ausgewählt, zeigt die rechte Spalte die Eigenschaften des Screens. Du kommst auch dorthin, indem du neben den Screen oder in der Objektliste auf die oberste Zeile klickst.

- **<span class="ui">Screen</span>:** der Name, die Art, das Icon und der Master. <span class="ui">Screen type</span> ist <span class="ui">Main screen</span> oder <span class="ui">Popup</span>, siehe [Popups](#popups). Mit <span class="ui">Show master</span> blendest du die Objekte des Masters für diesen einen Screen aus. Theme und Typografie übernimmt der Screen trotzdem. Ein Popup hat weder Icon noch <span class="ui">Show master</span>.
- **<span class="ui">Swipe navigation</span>:** was Wischen nach links, rechts, oben und unten auslöst, siehe [Hardware-Tasten und Gesten](/designer/tasten#wischgesten). Nur bei Geräten mit Touch. Auf einem Popup steht hier nur <span class="ui">A swipe closes a popup.</span>
- **<span class="ui">Look</span>:** <span class="ui">Theme</span> ist das Theme des Screens, ohne eigene Wahl das des Masters, siehe [Themes und Farben](/designer/themes). <span class="ui">Typography</span> legt fest, welche Schriften die [Stile](/objekte/anzeigen#stile) bekommen; ohne eigene Wahl gilt auch hier die des Masters. Das Feld erscheint nur, wenn das Gerät mehr als eine Typografie hat. Wählst du eine andere, bekommen alle Texte mit Stil auf dem Screen deren Schriften, auf einem Master auch die Texte der Screens, die seine übernehmen. Fehlt dem Gerät die gewählte, etwa nach einem Gerätewechsel, gilt «Standard», die Typografie, die jedes Gerät hat. <span class="ui">Background</span> ist die Rolle des Hintergrunds, ohne eigene Wahl die des Masters.

<Screenshot narrow name="feld-typography" alt="Unter Look die Felder Theme, Typography und Background" caption="Look: Theme und Typography nebeneinander." />
