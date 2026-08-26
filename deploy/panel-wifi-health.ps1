<#
.SYNOPSIS
    Liest die WLAN- und MQTT-Gesundheit des ScreenBee-Panels aus
    GET /api/debug - einmalig oder als Dauerbeobachtung.

.DESCRIPTION
    Beantwortet die eine Frage, die nach dem 2026-08-26 offen blieb:
    Firmware- oder Antennenproblem?

    Das Panel fiel an dem Tag mehrfach komplett vom WLAN und kam erst nach
    einem Neustart zurueck. Seit der Firmware vom selben Tag meldet es
    Signalstaerke, Abbruchgrund und Zaehler ueber /api/debug - vorher war
    nichts davon sichtbar (der Arduino-Core loggt den Grund nur per log_w,
    und CORE_DEBUG_LEVEL ist nicht gesetzt; der serielle Monitor setzt dieses
    Board beim Anstecken zurueck und scheidet ohnehin aus).

    Die entscheidenden Zahlen:

      wifiRssi         Signalstaerke. Unter -80 dBm erklaert die Funkstrecke
                       allein schon verlorene Keepalives, einseitig
                       sterbende TCP-Verbindungen und Aussetzer.
      wifiOwnRetries   Wie oft die Aufsicht in loop() eingegriffen hat, weil
                       der Core nach 12s nichts erreicht hatte. Groesser 0
                       heisst: hier haette die alte Firmware moeglicherweise
                       bis zum Neustart gelegen.
      ...ReasonName    Der Abbruchgrund. NO_AP_FOUND/BEACON_TIMEOUT holt der
                       Core selbst zurueck. ASSOC_LEAVE (8) nicht - das ist
                       die Sackgasse, fuer die die Aufsicht gebaut wurde.

    Ein "keine Antwort" ist hier ein Messwert, kein Fehler: genau das ist der
    Zustand, den wir jagen. Deshalb laeuft die Beobachtung weiter und haelt
    fest, wie lange er anhielt.

.PARAMETER Device
    IP des Panels. Vorgabe 192.168.8.133.

.PARAMETER Watch
    Dauerbeobachtung statt einmaliger Ausgabe. Mit Strg+C beenden - die
    Zusammenfassung kommt trotzdem.

.PARAMETER IntervalSeconds
    Abstand der Abfragen im Watch-Modus. Vorgabe 15.

.PARAMETER Minutes
    Nach so vielen Minuten von selbst aufhoeren. 0 = bis Strg+C.

.PARAMETER CsvPath
    Jede Messung zusaetzlich hier anhaengen, damit eine lange Beobachtung
    ein Fenster-Schliessen ueberlebt.

.EXAMPLE
    .\panel-wifi-health.ps1
    .\panel-wifi-health.ps1 -Watch -Minutes 30
    .\panel-wifi-health.ps1 -Watch -CsvPath .\panel.csv
#>
[CmdletBinding()]
param(
    [string]$Device = "192.168.8.133",
    [switch]$Watch,
    [int]$IntervalSeconds = 15,
    [int]$Minutes = 0,
    [string]$CsvPath,
    [double]$DistanceMeters = 0,
    [int]$ApTxDbm = 20
)

function Get-PanelDebug {
    param([string]$Ip)
    try {
        # Invoke-WebRequest -UseBasicParsing statt Invoke-RestMethod: in
        # Windows PowerShell 5.1 ist das der Weg, der ohne IE-Engine
        # auskommt und bei einem zaehen Geraet zuverlaessig in den Timeout
        # laeuft statt zu haengen.
        $res = Invoke-WebRequest -Uri "http://$Ip/api/debug" -UseBasicParsing -TimeoutSec 12
        return $res.Content | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Get-RssiUrteil {
    param([int]$Rssi)
    if ($Rssi -ge -60) { return @{ Text = "sehr gut";  Farbe = "Green" } }
    if ($Rssi -ge -67) { return @{ Text = "gut";       Farbe = "Green" } }
    if ($Rssi -ge -75) { return @{ Text = "brauchbar"; Farbe = "Yellow" } }
    if ($Rssi -ge -82) { return @{ Text = "schwach";   Farbe = "Yellow" } }
    return @{ Text = "kritisch"; Farbe = "Red" }
}

# Eine reine Schwellwerttabelle kennt die Entfernung nicht - und genau daran
# ist die Einordnung am 2026-08-26 gescheitert: -70 dBm hiess "brauchbar",
# waehrend das Panel zwei Meter neben dem Router lag. Ueber einen Raum hinweg
# sind -70 in Ordnung, auf 2 m sind sie Unsinn. Mit -DistanceMeters wird
# gerechnet statt eingestuft.
function Get-ErwarteterPegel {
    param([double]$Meter, [int]$TxDbm)

    # Freiraumdaempfung, 2,4 GHz (Kanalmitte 2437 MHz):
    #   FSPL = 20*log10(d/m) + 20*log10(f/MHz) - 27,55
    $fspl = 20 * [math]::Log10($Meter) + 20 * [math]::Log10(2437) - 27.55
    $bestenfalls = $TxDbm - $fspl
    # Abschlag fuer eine kleine Leiterplattenantenne, Mehrwegeausbreitung und
    # das, was im Weg steht. Bewusst grosszuegig: der Abschlag soll den
    # Normalfall abdecken, damit ein gemeldeter Fehlbetrag wirklich einer ist.
    $praktisch = $bestenfalls - 10

    return @{
        Fspl        = [math]::Round($fspl, 1)
        Bestenfalls = [math]::Round($bestenfalls, 0)
        Praktisch   = [math]::Round($praktisch, 0)
    }
}

function Show-Entfernungsurteil {
    param([int]$Rssi, [double]$Meter, [int]$TxDbm)

    if ($Meter -le 0) { return }

    $e = Get-ErwarteterPegel -Meter $Meter -TxDbm $TxDbm
    $fehlbetrag = [math]::Round($e.Praktisch - $Rssi, 0)

    Write-Host ""
    Write-Host ("Auf {0} m gerechnet:" -f $Meter) -ForegroundColor Cyan
    Write-Host ("  Freiraumdaempfung  {0} dB" -f $e.Fspl)
    Write-Host ("  zu erwarten        {0} dBm bestenfalls, {1} dBm realistisch" -f $e.Bestenfalls, $e.Praktisch)
    Write-Host ("  gemessen           {0} dBm" -f $Rssi)

    if ($fehlbetrag -le 5) {
        Write-Host ("  Fehlbetrag         {0} dB - unauffaellig" -f $fehlbetrag) -ForegroundColor Green
    } elseif ($fehlbetrag -le 15) {
        Write-Host ("  Fehlbetrag         {0} dB - auffaellig" -f $fehlbetrag) -ForegroundColor Yellow
        Write-Host "  Etwas daempft. Einbaulage, Blech in der Naehe, Antenne verdeckt." -ForegroundColor Yellow
    } else {
        $faktor = [math]::Round([math]::Pow(10, $fehlbetrag / 10), 0)
        Write-Host ("  Fehlbetrag         {0} dB - das ist ein Defekt in der Strecke" -f $fehlbetrag) -ForegroundColor Red
        Write-Host ("  Es fehlt Faktor {0} an Empfangsleistung. Auf diese Entfernung" -f $faktor) -ForegroundColor Red
        Write-Host "  erklaert das keine Umgebung mehr." -ForegroundColor Red
        Write-Host "  Beim Waveshare zuerst das Aluminiumgehaeuse verdaechtigen (siehe" -ForegroundColor Red
        Write-Host "  README des Firmware-Repos) - ein Metallkaefig um eine PCB-Antenne" -ForegroundColor Red
        Write-Host "  kostet leicht 20-30 dB. Gegenprobe: Geraet um 90 Grad drehen." -ForegroundColor Red
        Write-Host "  Springt der Wert um mehr als 10 dB, ist die Antenne abgeschattet." -ForegroundColor Red
    }
}

function Show-Einmalig {
    param($D)

    $urteil = Get-RssiUrteil -Rssi ([int]$D.wifiRssi)
    $upMin = [math]::Round($D.uptimeMs / 60000, 1)

    Write-Host ""
    Write-Host "Panel $Device" -ForegroundColor Cyan
    Write-Host ("  Laufzeit           {0} min" -f $upMin)
    Write-Host ("  Signal             {0} dBm  ({1})" -f $D.wifiRssi, $urteil.Text) -ForegroundColor $urteil.Farbe
    Write-Host ("  WLAN-Abrisse       {0}" -f $D.wifiDisconnects)
    Write-Host ("  davon selbst geholt {0}" -f $D.wifiOwnRetries) -ForegroundColor $(if ($D.wifiOwnRetries -gt 0) { "Yellow" } else { "Gray" })
    Write-Host ("  letzter Grund      {0} ({1})" -f $D.wifiLastDisconnectReasonName, $D.wifiLastDisconnectReason)
    if ($D.wifiDownMs -gt 0) {
        Write-Host ("  GERADE OHNE WLAN   seit {0}s" -f [math]::Round($D.wifiDownMs / 1000)) -ForegroundColor Red
    }
    # Die erste Verbindung kommt aus setupMqtt() und nicht ueber reconnect(),
    # deshalb ist mqttConnects um eins hoeher als die Zahl der Versuche nach
    # einem Abriss. "3 aus 2" gelesen zu haben ist verwirrend; getrennt
    # benannt ist es eindeutig.
    Write-Host ("  MQTT               {0} Verbindungen, {1} Wiederaufbau-Versuche, letzter Zustand {2}" -f `
            $D.mqttConnects, $D.mqttReconnects, $D.mqttLastState)
    Write-Host ("  schlimmste Schleife {0} ms" -f $D.worstLoopMs) `
        -ForegroundColor $(if ($D.worstLoopMs -gt 2000) { "Yellow" } else { "Gray" })
    Write-Host ""
    if ($D.worstLoopMs -gt 2000) {
        Write-Host ("Eine Schleife hat {0}s blockiert - so fuehlt sich 'das Panel haengt' an." -f `
            [math]::Round($D.worstLoopMs / 1000, 1)) -ForegroundColor Yellow
        Write-Host "Welche Phase, sagt das Feld 'phases' in /api/debug:" -ForegroundColor Yellow
        Write-Host "  http = HTTP-Auslieferung ueber eine zaehe Strecke, mqtt = Verbindungsaufbau." -ForegroundColor Yellow
    }

    Show-Entfernungsurteil -Rssi ([int]$D.wifiRssi) -Meter $DistanceMeters -TxDbm $ApTxDbm

    # Nur ohne Entfernungsangabe, sonst widerspricht die Schwellwerttabelle
    # der Rechnung - und die Rechnung ist die bessere Auskunft.
    if ($DistanceMeters -le 0 -and [int]$D.wifiRssi -lt -80) {
        Write-Host "Bei diesem Pegel erklaert die Funkstrecke die Aussetzer allein." -ForegroundColor Red
        Write-Host "Wie weit steht das Panel vom Router? Mit -DistanceMeters wird" -ForegroundColor Red
        Write-Host "gerechnet statt eingestuft - auf kurze Distanz sagt das mehr." -ForegroundColor Red
    }
    if ($D.wifiLastDisconnectReason -eq 8) {
        Write-Host "Grund 8 = ASSOC_LEAVE: die Sackgasse, die der Arduino-Core NICHT" -ForegroundColor Yellow
        Write-Host "wiederholt. Genau dafuer gibt es die Aufsicht - wifiOwnRetries pruefen." -ForegroundColor Yellow
    }
}

# --- einmalig ------------------------------------------------------------
if (-not $Watch) {
    $d = Get-PanelDebug -Ip $Device
    if ($null -eq $d) {
        Write-Host ""
        Write-Host "Panel $Device antwortet nicht." -ForegroundColor Red
        Write-Host "Das ist selbst ein Befund. Zum Unterscheiden:" -ForegroundColor Red
        Write-Host "  Ping geht, HTTP nicht  -> haengt, aber im Netz"
        Write-Host "  Ping geht auch nicht   -> vom WLAN gefallen (der Fall vom 2026-08-26)"
        Write-Host ""
        Write-Host "  Test-Connection $Device -Count 3"
        exit 1
    }
    Show-Einmalig -D $d
    exit 0
}

# --- Dauerbeobachtung ----------------------------------------------------
Write-Host "Beobachte $Device alle ${IntervalSeconds}s. Strg+C beendet - die Zusammenfassung kommt trotzdem." -ForegroundColor Cyan
if ($CsvPath) { Write-Host "Mitschrift: $CsvPath" -ForegroundColor Cyan }
Write-Host ""

$rssiWerte = New-Object System.Collections.Generic.List[int]
$startDisc = $null
$startRetries = $null
$letzteDisc = $null
$letzteUptime = $null
$ausfaelle = 0
$ausfallSeit = $null
$messungen = 0
$deadline = $null
if ($Minutes -gt 0) { $deadline = (Get-Date).AddMinutes($Minutes) }

try {
    while ($true) {
        if ($deadline -and (Get-Date) -gt $deadline) { break }

        $zeit = Get-Date -Format "HH:mm:ss"
        $d = Get-PanelDebug -Ip $Device

        if ($null -eq $d) {
            if ($null -eq $ausfallSeit) {
                $ausfallSeit = Get-Date
                $ausfaelle++
            }
            $dauer = [math]::Round(((Get-Date) - $ausfallSeit).TotalSeconds)
            Write-Host ("{0}  KEINE ANTWORT  (seit {1}s)" -f $zeit, $dauer) -ForegroundColor Red
            if ($CsvPath) {
                "$zeit,,,,,,,unreachable" | Add-Content -Path $CsvPath -Encoding utf8
            }
            Start-Sleep -Seconds $IntervalSeconds
            continue
        }

        if ($null -ne $ausfallSeit) {
            $dauer = [math]::Round(((Get-Date) - $ausfallSeit).TotalSeconds)
            Write-Host ("{0}  wieder da nach {1}s" -f $zeit, $dauer) -ForegroundColor Green
            $ausfallSeit = $null
        }

        $messungen++
        $rssiWerte.Add([int]$d.wifiRssi)
        if ($null -eq $startDisc) { $startDisc = [int]$d.wifiDisconnects }
        if ($null -eq $startRetries) { $startRetries = [int]$d.wifiOwnRetries }

        # Neustart erkennen: die Laufzeit kann nur wachsen.
        $neustart = ""
        if ($null -ne $letzteUptime -and $d.uptimeMs -lt $letzteUptime) {
            $neustart = "  << NEUSTART"
            $startDisc = [int]$d.wifiDisconnects
            $startRetries = [int]$d.wifiOwnRetries
        }
        $letzteUptime = $d.uptimeMs

        $neu = ""
        if ($null -ne $letzteDisc -and [int]$d.wifiDisconnects -gt $letzteDisc) {
            $neu = "  +{0} Abriss(e): {1}" -f ([int]$d.wifiDisconnects - $letzteDisc), $d.wifiLastDisconnectReasonName
        }
        $letzteDisc = [int]$d.wifiDisconnects

        $urteil = Get-RssiUrteil -Rssi ([int]$d.wifiRssi)
        $zeile = "{0}  rssi={1,4} dBm  up={2,5}s  abrisse={3,3}  eigen={4,2}  mqtt={5}/{6}{7}{8}" -f `
            $zeit, $d.wifiRssi, [math]::Round($d.uptimeMs / 1000), $d.wifiDisconnects,
        $d.wifiOwnRetries, $d.mqttConnects, $d.mqttReconnects, $neu, $neustart
        Write-Host $zeile -ForegroundColor $urteil.Farbe

        if ($CsvPath) {
            "{0},{1},{2},{3},{4},{5},{6},ok" -f $zeit, $d.wifiRssi, $d.uptimeMs, $d.wifiDisconnects,
            $d.wifiOwnRetries, $d.mqttConnects, $d.wifiLastDisconnectReasonName |
            Add-Content -Path $CsvPath -Encoding utf8
        }

        Start-Sleep -Seconds $IntervalSeconds
    }
} finally {
    Write-Host ""
    Write-Host "--- Zusammenfassung ---" -ForegroundColor Cyan
    if ($messungen -eq 0) {
        Write-Host "Keine einzige Antwort erhalten. Das Panel war die ganze Zeit weg." -ForegroundColor Red
    } else {
        $min = ($rssiWerte | Measure-Object -Minimum).Minimum
        $max = ($rssiWerte | Measure-Object -Maximum).Maximum
        $avg = [math]::Round(($rssiWerte | Measure-Object -Average).Average, 1)
        $urteil = Get-RssiUrteil -Rssi ([int]$avg)

        Write-Host ("  Messungen          {0}" -f $messungen)
        Write-Host ("  Signal             {0} dBm im Mittel ({1} bis {2}) - {3}" -f $avg, $min, $max, $urteil.Text) `
            -ForegroundColor $urteil.Farbe
        if ($null -ne $letzteDisc -and $null -ne $startDisc) {
            Write-Host ("  neue WLAN-Abrisse  {0}" -f ($letzteDisc - $startDisc))
        }
        Write-Host ("  HTTP-Ausfaelle     {0}" -f $ausfaelle) -ForegroundColor $(if ($ausfaelle -gt 0) { "Yellow" } else { "Gray" })
        Write-Host ""
        if ($avg -lt -80) {
            Write-Host "Urteil: Funkstrecke. Bei diesem Mittelwert braucht es keine" -ForegroundColor Red
            Write-Host "weitere Firmware-Suche - erst Antennenlage oder Access Point." -ForegroundColor Red
        } elseif ($avg -lt -70) {
            Write-Host "Urteil: grenzwertig. Wenn hier Abrisse dabei waren, ist die" -ForegroundColor Yellow
            Write-Host "Funkstrecke zumindest mitschuldig." -ForegroundColor Yellow
        } else {
            Write-Host "Urteil: Signal ist in Ordnung. Kamen trotzdem Abrisse vor," -ForegroundColor Green
            Write-Host "liegt es NICHT am Pegel - dann in /var/log/router-wifi.log" -ForegroundColor Green
            Write-Host "auf dem Pi nach dem Grund sehen." -ForegroundColor Green
        }
    }
}
