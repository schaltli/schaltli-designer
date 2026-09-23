# Versionen und Wiederherstellen

Es gibt drei Wege zurück zu einem früheren Stand: die Versionsgeschichte, die Kopie auf dem Gerät und die Projektdatei.

## Versionsgeschichte

<span class="ui">File</span> › <span class="ui">Version History</span> listet die gespeicherten Stände des Projekts mit Datum und Uhrzeit.

<Screenshot narrow name="versionen" alt="Der Dialog Version History mit einem Stand" />

Einen Stand legt der Designer bei jeder erfolgreichen [Übertragung](/designer/deploy) ab, nicht bei jeder Änderung. Die letzten 50 bleiben erhalten. <span class="ui">Restore</span> ersetzt das aktuelle Projekt durch diesen Stand, ohne Rückfrage.

## Vom Gerät zurückholen {#vom-geraet-zurueckholen}

Jedes Gerät behält eine Kopie des Projekts, das zuletzt übertragen wurde. Hast du die Projektdatei verloren oder ist der Designer neu installiert, holst du sie von dort zurück:

1. Auf der Startseite klick auf <span class="ui">Recover from Device...</span>.
2. Wähle das Gerät aus der Liste der Geräte, die sich gerade melden.
3. <span class="ui">Recover</span> lädt die Kopie und öffnet sie als Projekt.

Zurück kommt der Stand der letzten Übertragung. Was du danach geändert und nicht übertragen hast, ist nicht dabei.

## Die Projektdatei

<span class="ui">File</span> › <span class="ui">Download Project</span> sichert das Projekt als Datei, <span class="ui">Upload Project</span> öffnet sie wieder. Das ist der einzige Weg, der nicht vom Designer oder Gerät abhängt. Sichere wichtige Projekte so, besonders vor grösseren Umbauten, denn der Designer kennt kein Rückgängig.

## Automatische Sicherung

Der Designer speichert jede Änderung nach drei Sekunden auf dem Rechner, auf dem er läuft. Öffnest du ihn im selben Browser wieder, bietet er mit <span class="ui">Continue where you left off?</span> an, dort weiterzumachen. Das gilt nur für das zuletzt bearbeitete Projekt.
