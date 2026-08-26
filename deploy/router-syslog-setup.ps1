<#
.SYNOPSIS
    Laesst den GL.iNet-Router sein Syslog dauerhaft an den Pekaway schicken,
    damit WLAN-Abbruchgruende einen Ausfall ueberleben.

.DESCRIPTION
    Warum es das gibt (2026-08-26): das ScreenBee-Panel im Fahrzeug fiel
    mehrfach komplett vom WLAN und kam erst nach einem Neustart zurueck. Den
    Abbruchgrund kennt nur der Access Point - die Firmware konnte ihn bis
    dahin nicht melden, und der Arduino-Core loggt ihn zwar, aber
    CORE_DEBUG_LEVEL ist nicht gesetzt, also wird die Zeile wegkompiliert.
    Der serielle Monitor scheidet auf diesem Board ohnehin aus, er setzt es
    beim Anstecken zurueck.

    Ein "logread -f" im Terminal stirbt mit der SSH-Sitzung und ist damit
    genau dann weg, wenn der Ausfall kommt. Deshalb dieser Weg: der Router
    schickt sein Syslog per UDP an den Pi, wo rsyslog es nach
    /var/log/router-wifi.log schreibt (siehe /etc/rsyslog.d/40-router-wifi.conf
    dort, bereits eingerichtet).

    Das Skript fasst KEIN Passwort an. ssh fragt selbst danach, direkt an der
    Konsole - hier wird nichts gespeichert, nichts weitergereicht und nichts
    in eine Prozessliste geschrieben.

.PARAMETER Router
    IP des Routers. Vorgabe 192.168.8.1.

.PARAMETER User
    SSH-Benutzer auf dem Router. Vorgabe root.

.PARAMETER SyslogHost
    Wohin die Meldungen gehen - der Pekaway. Vorgabe 192.168.8.107.

.PARAMETER VerboseWifi
    Setzt zusaetzlich das WLAN-Protokoll auf gespraechig. Nur dann steht der
    numerische Reason-Code in vielen OpenWrt-Builds ueberhaupt drin. Kostet
    Log-Volumen; fuer ein paar Tage Fehlersuche vertretbar, danach mit
    -Undo oder von Hand zuruecknehmen.

.PARAMETER Undo
    Nimmt beides wieder zurueck.

.EXAMPLE
    .\router-syslog-setup.ps1
    .\router-syslog-setup.ps1 -VerboseWifi
    .\router-syslog-setup.ps1 -Signal
    .\router-syslog-setup.ps1 -Undo
#>
[CmdletBinding()]
param(
    [string]$Router = "192.168.8.1",
    [string]$User = "root",
    [string]$SyslogHost = "192.168.8.107",
    [int]$SyslogPort = 514,
    [string]$PanelMac = "d0:cf:13:1e:0f:c0",
    [switch]$VerboseWifi,
    [switch]$Signal,
    [switch]$Undo
)

$ErrorActionPreference = "Stop"

function Invoke-Router {
    param([string]$Command, [string]$Label)

    Write-Host ""
    Write-Host "--- $Label ---" -ForegroundColor Cyan
    # Ein einziges Argument: PowerShell reicht die Zeichenkette unveraendert
    # an ssh weiter, und die entfernte sh bekommt sie als ein Kommando. Kein
    # Pipe nach "sh -s", weil ssh die Konsole fuer die Passwortabfrage
    # braucht und ein umgeleiteter stdin das je nach Aufbau stoert.
    & ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$User@$Router" $Command
    if ($LASTEXITCODE -ne 0) {
        throw "ssh brach mit Exitcode $LASTEXITCODE ab (Label: $Label)"
    }
}

function Invoke-RouterScript {
    param([string]$Script, [string]$Label)

    Write-Host ""
    Write-Host "--- $Label ---" -ForegroundColor Cyan
    # Base64 statt Anfuehrungszeichen-Akrobatik: die Zeichenkette geht durch
    # PowerShells Argumentbehandlung, dann durch ssh, dann durch die entfernte
    # sh - drei Ebenen, die jeweils eigene Vorstellungen von Quoting haben.
    # Base64 ist alphanumerisch plus +/=, da kann keine davon etwas kaputt
    # machen. busybox auf OpenWrt kann "base64 -d".
    $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($Script))
    & ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$User@$Router" "echo $b64 | base64 -d | sh"
    if ($LASTEXITCODE -ne 0) {
        throw "ssh brach mit Exitcode $LASTEXITCODE ab (Label: $Label)"
    }
}

# Erreichbarkeit zuerst, sonst haengt die Passwortabfrage an einem Router,
# der gar nicht da ist.
Write-Host "Pruefe $Router ..." -NoNewline
if (-not (Test-Connection -ComputerName $Router -Count 2 -Quiet)) {
    Write-Host " nicht erreichbar." -ForegroundColor Red
    throw "$Router antwortet nicht. Im richtigen Netz?"
}
Write-Host " da." -ForegroundColor Green

if ($Signal) {
    # Die Gegenrichtung. Der RSSI, den das Panel meldet, ist nur die eine
    # Haelfte - was der Access Point von ihm empfaengt, steht hier, und vor
    # allem die Wiederholungsraten. "tx retries" und "tx failed" sagen mehr
    # ueber die Brauchbarkeit einer Verbindung als jeder Pegel: eine Strecke,
    # die jedes Paket dreimal senden muss, ist auch bei ordentlichem RSSI
    # kaputt.
    #
    # Die Schnittstellennamen werden nicht geraten - je nach Chipsatz heissen
    # sie wlan0, ath0 oder ra0. iwinfo listet sie selbst auf.
    $mac = $PanelMac.ToLower()
    $sh = @"
MAC=$mac
echo "gesucht: `$MAC"
for i in `$(iwinfo 2>/dev/null | awk '/ESSID/{print `$1}'); do
  echo ""
  echo "== `$i =="
  iwinfo "`$i" assoclist 2>/dev/null | grep -i -A4 "`$MAC" || echo "  (nicht an dieser Schnittstelle)"
  iw dev "`$i" station dump 2>/dev/null | grep -i -A40 "`$MAC" \
    | grep -iE "Station|signal|bitrate|retries|failed|connected time|inactive|beacon loss" || true
done
"@
    Invoke-RouterScript -Script $sh -Label "Was der Access Point vom Panel empfaengt"

    Write-Host ""
    Write-Host "Lesehilfe:" -ForegroundColor Cyan
    Write-Host "  signal        Sicht des Routers. Weicht er stark vom Wert des Panels ab,"
    Write-Host "                sendet eine Seite schlechter als die andere."
    Write-Host "  tx retries    Wiederholungen. Im Verhaeltnis zu 'tx packets' die ehrlichste"
    Write-Host "                Zahl - deutlich ueber ein paar Prozent heisst zaehe Strecke."
    Write-Host "  tx bitrate    Faellt die Rate auf einstellige MBit/s, regelt der Router"
    Write-Host "                wegen schlechter Verbindung herunter."
    Write-Host ""
    Write-Host "Auf 2 m Abstand waeren rund -40 bis -50 dBm zu erwarten. Alles darunter" -ForegroundColor Yellow
    Write-Host "deutet auf Abschattung - beim Waveshare zuerst das Aluminiumgehaeuse." -ForegroundColor Yellow
    return
}

if ($Undo) {
    $parts = @(
        "uci -q delete system.@system[0].log_ip",
        "uci -q delete system.@system[0].log_proto",
        "uci -q delete system.@system[0].log_port",
        "uci -q delete system.@system[0].log_remote",
        "uci commit system",
        "uci -q delete wireless.radio0.log_level",
        "uci -q delete wireless.radio1.log_level",
        "uci commit wireless",
        "/etc/init.d/log restart",
        "wifi reload",
        "echo ZURUECKGENOMMEN"
    )
    Invoke-Router -Command ($parts -join "; ") -Label "Fernprotokoll abschalten"
    Write-Host ""
    Write-Host "Zurueckgenommen. Auf dem Pi bleibt /etc/rsyslog.d/40-router-wifi.conf" -ForegroundColor Yellow
    Write-Host "liegen - der lauscht dann nur noch ins Leere, was nichts kostet."
    return
}

# uci set schreibt zunaechst nur in einen Zwischenspeicher unter /tmp/.uci -
# das allein waere fluechtig. Erst "uci commit" schreibt /etc/config/system
# in den Flash, und genau das macht die Einstellung neustartfest.
$parts = @(
    "uci set system.@system[0].log_ip='$SyslogHost'",
    "uci set system.@system[0].log_proto='udp'",
    "uci set system.@system[0].log_port='$SyslogPort'",
    # In neueren OpenWrt-Fassungen der Schalter, der das Fernprotokoll
    # ueberhaupt aktiviert. Kennt der Build ihn nicht, liegt er wirkungslos
    # in der Konfiguration - das schadet nichts.
    "uci set system.@system[0].log_remote='1'",
    "uci commit system",
    "/etc/init.d/log restart"
)

if ($VerboseWifi) {
    # radio1 gibt es nicht auf jedem Geraet, deshalb -q: ein fehlendes
    # Funkmodul soll den Lauf nicht abbrechen.
    $parts += "uci -q set wireless.radio0.log_level='1'"
    $parts += "uci -q set wireless.radio1.log_level='1'"
    $parts += "uci commit wireless"
    $parts += "wifi reload"
}

Invoke-Router -Command ($parts -join "; ") -Label "Fernprotokoll einrichten"

# Zurueckgelesen statt geglaubt: was hier steht, steht in /etc/config/system
# und ueberlebt einen Neustart.
Invoke-Router -Command "uci show system.@system[0] | grep -E 'log_' || echo '(nichts gesetzt)'" `
    -Label "Gespeicherter Stand"

$stamp = Get-Date -Format "HH:mm:ss"
Invoke-Router -Command "logger -t router-syslog-test 'Testzeile $stamp von router-syslog-setup.ps1'; echo gesendet" `
    -Label "Testzeile senden"

Write-Host ""
Write-Host "Fertig. Jetzt auf dem Pekaway pruefen, ob die Testzeile angekommen ist:" -ForegroundColor Green
Write-Host "    sudo tail -n 20 /var/log/router-wifi.log"
Write-Host ""
Write-Host "Steht dort 'Testzeile $stamp', laeuft die Kette. Ab dann faengt sie den" -ForegroundColor Green
Write-Host "naechsten WLAN-Ausfall des Panels mit Grund ein:"
Write-Host "    sudo grep -iE 'deauth|disassoc|d0:cf:13:1e:0f:c0' /var/log/router-wifi.log | tail -30"
