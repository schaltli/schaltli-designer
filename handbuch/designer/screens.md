# Screens und Master

Ein Projekt besteht aus Screens, zwischen denen man auf dem Gerät wechselt: eine Übersicht, ein Screen fürs Licht, einer für die Heizung. Was auf mehreren Screens gleich sein soll, etwa ein Hintergrund oder eine Statuszeile, legst du einmal auf einen Master-Screen. Was du nur ab und zu brauchst, etwa den Timer der Heizung, kommt auf ein Popup.

## Screens anlegen und ordnen

Links in der Liste <span class="ui">Screens</span> öffnet <span class="ui">+</span> ein kleines Menü: <span class="ui">Add Screen</span>, <span class="ui">Add Master Screen</span> oder <span class="ui">Add Popup Screen</span>. Im Dialog gibst du einen Namen ein. Für normale Screens schlägt der Designer beim Tippen gleich ein passendes Icon vor. Das Icon brauchen Geräte mit Screen-Menü, etwa der [Knob](/geraete/knob). <span class="ui">Create Screen</span> legt den Screen an.

Die Reihenfolge änderst du, indem du die Vorschaubilder in der Liste verschiebst. Sie ist auch die Reihenfolge, in der <span class="ui">Next screen</span> und <span class="ui">Previous screen</span> blättern und in der du wischst, siehe [Screens über- und untereinander](#position).

Fährst du mit der Maus über ein Vorschaubild, erscheint ein Menü mit <span class="ui">Duplicate</span>, <span class="ui">Copy</span> und <span class="ui">Delete</span>. Löschen geschieht ohne Rückfrage, <kbd>Strg</kbd>+<kbd>Z</kbd> holt den Screen zurück. Den letzten Screen kannst du nicht löschen, ebenso wenig einen Master, den noch Screens verwenden.

## Screens über- und untereinander {#position}

Die Screens liegen in einer Reihe, der Hauptreihe, in der Reihenfolge der Liste. Wischst du nach links, kommt der Screen, der rechts daneben liegt, wischst du nach rechts, der links daneben. <span class="ui">Next screen</span> und <span class="ui">Previous screen</span> blättern durch dieselbe Reihe.

Einen Screen kannst du auch über oder unter einen anderen legen, zum Beispiel den Verlauf der Batterie unter den Screen «Energie». Dazu wählst du in den Eigenschaften des Screens unter <span class="ui">Position</span> den Platz, etwa «Below "Energie"». <span class="ui">In the main row</span> holt ihn in die Reihe zurück.

- Nach oben wischen zieht den Screen herauf, der darunter liegt. Nach unten wischen bringt dich zurück.
- Links und rechts neben einen solchen Screen kannst du weitere legen, darüber oder darunter aber nicht.
- Nachbarn sind nur Screens, die aneinander liegen. Liegen zwei Verläufe unter zwei Screens nebeneinander, wischst du trotzdem nicht vom einen zum anderen.
- Links und rechts eines Screens der Hauptreihe liegt die Reihe selbst. Dort ordnest du in der Liste.
- Ein Screen ausserhalb der Hauptreihe wird beim Blättern übersprungen und steht nicht im [Navigator](/objekte/anordnen#navigator). Auf ihm zeigt der Navigator nur einen Pfeil, der zurückführt.

Was eine Wischgeste tut, entscheidet sich in dieser Reihenfolge: zuerst die Aktion, die der Screen selbst dafür hat, dann der Screen, der in dieser Richtung liegt, zuletzt die Aktion des Masters. Ein Screen ohne eigene Wischgesten wischt also zu seinen Nachbarn, auch wenn der Master nichts vorgibt. Soll eine Wischgeste nichts tun, wählst du <span class="ui">Nothing</span>.

Versteckst oder löschst du einen Screen, an dem andere liegen, macht der Designer diese zu versteckten Screens und nennt sie. Versteckte Screens, Master und Popups liegen nirgends.

::: warning Geräte
Die Plätze über und unter einem Screen kennen die Geräte erst mit ihrer nächsten Firmware und App. Bis dahin erreichst du einen solchen Screen dort nur mit einem Button oder einer Taste mit <span class="ui">Go to a screen</span>, und beim Blättern wird er übersprungen.
:::

## Einen Screen in ein anderes Projekt übernehmen {#kopieren}

<span class="ui">Copy</span> im Menü eines Vorschaubilds legt den Screen in die Zwischenablage, und zwar mit allem, was er braucht: Icons und Bilder, Schriften, Topics und Combined Topics. Öffne dann das andere Projekt, auch in einem anderen Browser-Tab oder einem anderen Designer, klick auf den Screen und drück <kbd>Strg</kbd>+<kbd>V</kbd>. Der Screen kommt als neuer Screen nach dem offenen hinzu.

So übernimmst du etwa die Screens der [Demo](/einfuehrung/ausprobieren#demo) in dein eigenes Projekt. Sie lesen nur Topics der [VanPi-Brücke](/betrieb/vanpi-bruecke), und die hat jedes Pekaway-System, auf dem Schaltli installiert ist.

Beim Einfügen gilt:

- Der Screen bekommt den ersten Master des Projekts und dessen Theme. Er sieht also aus wie deine anderen Screens.
- Gibt es seinen Namen schon, bekommt er eine Zahl dazu, etwa «Energie 2».
- Was das Projekt schon hat, wird nicht verdoppelt. Ein Icon oder ein Combined Topic, das unter demselben Namen etwas anderes ist, kommt mit einem neuen Namen dazu, etwa `licht_an_2`. Dein eigenes bleibt, wie es ist.
- Wurde der Screen für ein Gerät mit anderer Grösse gebaut, meldet der Designer das. Verschieben und anpassen musst du die Objekte dann selbst.

<span class="ui">Manage Screens</span> unten in der Liste zeigt alle Screens mit ihren Einstellungen in einer Tabelle.

## Master-Screens

Die Objekte eines Master-Screens erscheinen auf jedem Screen, der ihn verwendet. Bearbeiten kannst du sie nur auf dem Master selbst. Auch das [Theme](/designer/themes), die Hintergrundfarbe und die Belegung der [Hardware-Tasten](/designer/tasten) erbt ein Screen von seinem Master.

Ein Master ist selbst nie auf dem Gerät zu sehen. Er ist kein Ziel für <span class="ui">Go to a screen</span>, und beim Blättern wird er übersprungen.

Jeder Screen hat einen Master, denn von ihm bekommt er sein Theme und seine Typografie. Ein neuer Screen bekommt den Master, den du gerade vor dir hast: den Master, der offen ist, oder den Master des Screens, der offen ist. Einen Master, den noch Screens verwenden, kannst du nicht löschen, und den letzten auch nicht.

## Popups {#popups}

Ein Popup ist ein Screen, der sich auf Knopfdruck über den aktuellen legt. Tippst du daneben, ist es wieder weg. Es passt für das, was du selten brauchst und was den Screen sonst überladen würde.

Du gestaltest ein Popup wie jeden Screen, in voller Grösse. Der Designer zeichnet darauf einen violetten Umriss, auf einem runden Gerät einen Kreis, sonst ein Rechteck. Innen liegen 80 Prozent der Bildschirmfläche, und das ist das Fenster. Was du ausserhalb hinsetzt, zeichnet das Gerät zwar auch, aber neben das Fenster. Der Designer blendet es deshalb ab, verbieten tut er es nicht.

Ein Button oder eine Taste mit <span class="ui">Open a popup</span> öffnet das Popup, siehe [Hardware-Tasten und Gesten](/designer/tasten). Mehrere Buttons auf verschiedenen Screens dürfen dasselbe Popup öffnen. Zu geht es

- mit einem Tipp auf das ✕ oben rechts am Fenster,
- mit einem Tipp neben das Fenster,
- mit einer Wischgeste, ausser du ziehst gerade an einem Slider oder Dial im Popup,
- mit einem Button oder einer Taste mit <span class="ui">Close this popup</span>.

Danach bist du wieder auf dem Screen, von dem aus du es geöffnet hast. Wie das Fenster genau aussieht, entscheidet das Gerät, zum Beispiel ein abgedunkelter Hintergrund oder ein Schatten.

Jedes Gerät setzt auf ein offenes Popup einen runden Knopf mit einem ✕, halb auf den Rand des Fensters: auf die obere rechte Ecke, auf dem runden Knob oben rechts auf den Kreis. So sieht jeder, wie das Popup wieder zugeht, auch wer es nicht selbst gebaut hat. Ausschalten lässt sich der Knopf nicht, und der Designer zeigt ihn beim Bearbeiten an derselben Stelle: Was du darunter legst, verdeckt er, und ein Tipp dorthin schliesst das Popup. Dafür braucht das Gerät eine Firmware oder App ab dem 7. Oktober 2026.

Ein Popup steht nicht in der Reihenfolge von <span class="ui">Next screen</span> und <span class="ui">Previous screen</span> und ist kein Ziel für <span class="ui">Go to a screen</span>. Es hat einen Master, aber nur für Theme und Typografie. Die Objekte und die Tastenbelegung des Masters übernimmt es nicht.

Mit <span class="ui">Screen type</span> in den Eigenschaften machst du aus einem Screen ein Popup und umgekehrt. Ein Screen, der zum Popup wird, verliert seine Wischgesten. Löschst du ein Popup, das Buttons noch öffnen, tun diese Buttons nichts mehr.

## Ein Screen ist frei {#layout}

Was du auf einen Screen setzt, bleibt dort, wo du es hinsetzt. Willst du Namen und Bedienelemente bündig untereinander, steckst du sie zu einer [Tabelle](/objekte/anordnen#zusammenstecken) zusammen: Ziehst du ein Objekt an ein anderes heran, rasten die beiden ein. Ein [Baustein](/designer/bausteine) kommt gleich als Zeile, den nächsten trägst du unter die Tabelle.

Projekte, in denen ein Screen noch selbst eine Tabelle war oder ein Master einen Inhaltsbereich hatte, öffnet der Designer so, dass alles bleibt, wo es war. Was die Tabelle des Screens anordnete, liegt danach frei an derselben Stelle. Den Inhaltsbereich gibt es nicht mehr.

## Die Eigenschaften eines Screens

Ist nichts ausgewählt, zeigt die rechte Spalte die Eigenschaften des Screens. Du kommst auch dorthin, indem du neben den Screen oder in der Objektliste auf die oberste Zeile klickst.

- **<span class="ui">Screen</span>:** der Name, die Art, das Icon und der Master. <span class="ui">Screen type</span> ist <span class="ui">Main screen</span> oder <span class="ui">Popup</span>, siehe [Popups](#popups). Mit <span class="ui">Show master</span> blendest du die Objekte des Masters für diesen einen Screen aus. Theme und Typografie übernimmt der Screen trotzdem. Ein Popup hat weder Icon noch <span class="ui">Show master</span>.

  Das Icon ist <span class="ui">Fixed</span> oder <span class="ui">Live</span>. Live zeigt je nach Wert ein anderes Icon, mit denselben Regeln wie ein [Icon mit Live](/objekte/anzeigen#icon): etwa die erleuchtete Glühbirne, solange ein Combined topic «irgendwo brennt Licht» ja sagt. Das bisherige Icon wird zu <span class="ui">Otherwise</span>. Der [Navigator](/objekte/anordnen#navigator) zeigt das Icon, das gerade gilt.

  Mit <span class="ui">Hide screen</span> nimmst du einen Screen aus dem Wischen und aus dem Navigator. Ein Button mit <span class="ui">Go to a screen</span> erreicht ihn weiter, das passt etwa für einen Einstellungs-Screen. Das Projekt startet auf dem ersten Screen, der nicht versteckt ist. In der Screen-Liste trägt er die Marke «Hidden».

  Mit <span class="ui">Position</span> legst du den Screen in die Hauptreihe oder über oder unter einen anderen, siehe [Screens über- und untereinander](#position). Ein Screen ausserhalb der Reihe hat kein <span class="ui">Hide screen</span>: Beim Blättern wird er ohnehin übersprungen.

  ::: warning Ältere Firmware
  <span class="ui">Hide screen</span> wirkt auf Geräten ab Systemgeneration 1.5. Mit älterer Firmware lässt sich ein versteckter Screen dort per Wischen erreichen, und beim Übertragen nennt der Dialog ihn.
  :::
- **<span class="ui">Hardware buttons</span>:** was die Tasten des Geräts auslösen, jede mit ihrer Auswahl, siehe [Hardware-Tasten und Gesten](/designer/tasten). Nur bei Geräten mit Tasten, etwa dem Knob.
- **<span class="ui">Swipe navigation</span>:** was Wischen nach links, rechts, oben und unten auslöst, siehe [Hardware-Tasten und Gesten](/designer/tasten#wischgesten). Nur bei Geräten mit Touch. Auf einem Popup steht hier nur <span class="ui">A swipe closes a popup.</span>
- **<span class="ui">Look</span>:** <span class="ui">Theme</span> ist das Theme des Screens, ohne eigene Wahl das des Masters, siehe [Themes und Farben](/designer/themes). <span class="ui">Typography</span> legt fest, welche Schriften die [Stile](/objekte/anzeigen#stile) bekommen; ohne eigene Wahl gilt auch hier die des Masters. Das Feld erscheint nur, wenn das Gerät mehr als eine Typografie hat. Wählst du eine andere, bekommen alle Texte mit Stil auf dem Screen deren Schriften, auf einem Master auch die Texte der Screens, die seine übernehmen. Fehlt dem Gerät die gewählte, etwa nach einem Gerätewechsel, gilt «Standard», die Typografie, die jedes Gerät hat. <span class="ui">Background</span> ist die Rolle des Hintergrunds, ohne eigene Wahl die des Masters.

<Screenshot narrow name="feld-typography" alt="Unter Look die Felder Theme, Typography und Background" caption="Look: Theme und Typography nebeneinander." />
