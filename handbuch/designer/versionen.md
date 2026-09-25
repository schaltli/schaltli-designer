# Versionen und Wiederherstellen

Es gibt vier Wege zurück zu einem früheren Stand: die Versionen eines Projekts, den Entwurf im Browser, die Kopie auf dem Gerät und die Projektdatei.

## Versionen

Jedes Speichern legt eine Version an, ebenso jede [Übertragung](/designer/deploy), die vorher speichert. <span class="ui">File</span> › <span class="ui">Version History</span> listet die Versionen des offenen Projekts, die neueste zuoberst, jede mit Datum und Uhrzeit, dem Gerätetyp und, falls sie übertragen wurde, dem Gerät.

<Screenshot narrow name="versionen" alt="Der Dialog Version History mit der übertragenen Version und ihrem Board" />

<span class="ui">Restore</span> öffnet eine Version so, als hättest du sie gerade bearbeitet: als ungespeicherte Änderung, erkennbar am Punkt vor dem Namen. Gelöscht wird dabei nichts. Speicherst du, wird sie die neueste Version, und die anderen bleiben. Mit <kbd>Strg</kbd>+<kbd>Z</kbd> kommst du nach einem Restore nicht zum Stand davor zurück, der steht aber weiterhin als Version in der Liste.

Pro Projekt bleiben die letzten 20 Versionen erhalten. Die neueste Version, die auf einem Gerät läuft, fällt nie weg, auch wenn sie älter ist.

Ein Projekt, das noch nie gespeichert wurde, hat keine Versionen. Der Dialog sagt dann <span class="ui">Save the project to start its version history.</span>

## Entwurf im Browser

Solange ein Projekt ungespeicherte Änderungen hat, behält der Browser eine Kopie davon. Stürzt der Tab ab, schliesst du ihn oder lädst du neu, geht so nichts verloren. In der Projektliste steht beim Projekt dann «Unsaved changes» mit Datum und Uhrzeit. Ein Projekt, das nie gespeichert wurde, erscheint als «Untitled».

Öffnest du das Projekt, kommt der Entwurf mit, weiterhin als ungespeicherte Änderung. <span class="ui">Discard changes</span> im Menü des Eintrags verwirft ihn. Speichern macht ihn überflüssig, er verschwindet dann von selbst.

Der Entwurf liegt nur in diesem Browser auf diesem Gerät, nicht beim Designer. Von einem anderen Browser aus siehst du ihn nicht.

## Vom Gerät zurückholen {#vom-geraet-zurueckholen}

Jedes Gerät behält eine Kopie des Projekts, das zuletzt übertragen wurde. Hast du das Projekt gelöscht oder ist der Designer neu installiert, holst du es von dort zurück:

1. Auf der Startseite klick auf <span class="ui">Recover from Device...</span>.
2. Wähle das Gerät aus der Liste der Geräte, die sich gerade melden.
3. <span class="ui">Recover</span> lädt die Kopie und öffnet sie als Projekt ohne Namen. Speichere es, um es wieder in der Projektliste zu haben.

Zurück kommt der Stand der letzten Übertragung. Was du danach geändert und nicht übertragen hast, ist nicht dabei.

## Die Projektdatei

<span class="ui">File</span> › <span class="ui">Download Project</span> sichert das Projekt als Datei, <span class="ui">Upload Project</span> öffnet sie wieder. Das ist der einzige Weg, der nicht vom Designer oder Gerät abhängt. Sichere wichtige Projekte so, besonders vor grösseren Umbauten.
