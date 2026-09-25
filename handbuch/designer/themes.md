# Themes und Farben

Farben wählst du im Designer nicht einzeln. Jeder Screen hat ein Theme, und jede Farbe eines Objekts ist eine Rolle in diesem Theme: Text, Hintergrund, Akzent. Wechselt ein Screen das Theme, bekommen alle seine Objekte neue Farben, die zueinander passen. So sehen Screens verschieden aus, ohne dass du Farben aussuchen musst.

## Die acht Themes

Der Designer bringt acht Themes mit: Lavender, Schaltli, Slate, Forest, Ocean, Amber, Terracotta und Garden. Jedes gibt es hell und dunkel. Lavender ist das Theme, mit dem neue Master anfangen. Die Themes lassen sich nicht bearbeiten.

## Master und Screen

Jeder Master hat ein Theme. Ein Screen übernimmt das seines Masters, bis du ihm ein eigenes gibst. Deshalb hat auch jeder Screen einen Master: Ohne Master gäbe es kein Theme, von dem er ausgeht. Ein neuer Screen bekommt den Master, den du gerade vor dir hast, siehe [Screens und Master](/designer/screens#master-screens).

Das Theme stellst du in den Eigenschaften des Screens oder Masters ein, unter <span class="ui">Colour</span> › <span class="ui">Theme</span>. Offen zeigt die Liste jedes Theme als zwei kleine Screens, hell und dunkel, mit einem Dial, einem Slider und einem Icon. Zu ist nur noch der Name zu sehen und ein Punkt in der Akzentfarbe.

Bei einem Screen steht oben in der Liste <span class="ui">Inherit from Master</span> mit dem Namen des Themes, das er dann übernimmt. Solange er keines selbst gewählt hat, zeigt das Feld <span class="ui">Inherited from Master</span> und das Theme des Masters.

Objekte, die auf dem Master liegen, erscheinen auf jedem Screen in dessen Theme. Dieselbe Beschriftung ist auf einem dunklen Screen hell und auf einem hellen dunkel.

## Rollen {#rollen}

Unter <span class="ui">Colour</span> wählt jedes Objekt für jede seiner Farben eine Rolle. Das Farbfeld daneben zeigt, wie die Rolle auf diesem Screen aussieht.

| Rolle | wofür |
|---|---|
| <span class="ui">Surface</span> | der Hintergrund des Screens |
| <span class="ui">Panel</span> | Flächen auf dem Screen: Boxen, Felder |
| <span class="ui">Outline</span> | Ränder und ruhige Linien |
| <span class="ui">Text</span> | Text, Linien, Icons |
| <span class="ui">Muted text</span> | Nebentext, Untertitel |
| <span class="ui">Accent</span> | Füllung von Bar, Slider, Gauge und Dial, Schalter und Buttons |
| <span class="ui">Text on accent</span> | Text auf einer Fläche in der Akzentfarbe |
| <span class="ui">Second accent</span> | eine zweite Hervorhebung, etwa ein Button, der sich vom Rest abheben soll |

Dazu gibt es <span class="ui">Transparent</span>, wo ein Objekt durchsichtig sein darf, und beim Icon <span class="ui">Icon's own color</span> für die Farben, die das Icon selbst hat. Neue Objekte bekommen die Rolle, die zu ihnen passt: Text die Rolle Text, eine Bar den Akzent. Eine neue Beschriftung hat keinen Hintergrund und keinen Rahmen.

## Hell und dunkel

Der Schalter <span class="ui">Dark</span> unten rechts neben <span class="ui">Adornment</span> zeigt im Designer die dunkle Variante der Themes: im Screen, in den Vorschaubildern und in der Vorschau. Er ändert nichts am Projekt und ist kein Schritt, den <span class="ui">Undo</span> zurücknimmt.

Auf die Geräte kommt im Moment die helle Variante.

## Graustufen und Schwarzweiss

Der [PaperS3](/geraete/papers3) und E-Paper-Displays haben nur eine Variante, die helle, auf die Farben gerundet, die das Display zeigen kann. <span class="ui">Dark</span> ist dort ausgegraut. Zwei Themes, die gleich hell sind, sehen auf einem solchen Gerät gleich aus. In der Liste der Themes siehst du das schon beim Auswählen.

## Ältere Projekte

Ein Projekt aus der Zeit vor den Themes öffnet der Designer mit dem Theme Lavender. Jede Farbe darin wird zu der Rolle, die ihr am nächsten kommt. Objekte mit den früheren Standardfarben sehen danach aus wie vorher, eine selbst gewählte Farbe wird zur nächsten Rolle. Screens ohne Master bekommen einen, mit ausgeschaltetem <span class="ui">Show master</span>, damit sich an ihnen sonst nichts ändert. Beim nächsten Speichern ist das Projekt umgestellt.
