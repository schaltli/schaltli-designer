"""Read a board's serial output for a while and print it.

Node has no serial support of its own, and pulling a package in for one HIL
step would put a native dependency in the designer's install. PlatformIO's
environment already ships pyserial (esptool needs it), and that is the same
environment this suite flashes with - so the boot output is read with that.

  python read-serial.py COM7 25 [115200]

Prints every line it sees, prefixed, and exits when the seconds are up. A port
that cannot be opened is not an error here: run.js decides what that means.

**DTR and RTS are held low before the port is opened.** An ESP32-S3's native USB
treats a host raising them as a reset request: opening the port the ordinary way
restarts the board, its USB re-enumerates, and the handle just opened goes dead -
so the reader sits there and sees nothing at all, which is exactly what happened
to the knob on 2026-09-18 while the flash itself had verified perfectly. A board
that disappears mid-read is therefore also waited for and reopened rather than
given up on.
"""

import sys
import time

import serial

port = sys.argv[1]
seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 25.0
baud = int(sys.argv[3]) if len(sys.argv) > 3 else 115200


def open_quietly(name, rate):
    """Open without ever raising DTR/RTS, so the board is not reset by being watched."""
    connection = serial.Serial()
    connection.port = name
    connection.baudrate = rate
    connection.timeout = 0.5
    connection.dtr = False
    connection.rts = False
    connection.open()
    return connection


# The first open needs the same patience as the later ones: this usually starts
# moments after esptool reset the board, and for a second or two the port is
# simply not there yet.
connection = None
last_error = None
until_open = time.time() + 10
while connection is None and time.time() < until_open:
    try:
        connection = open_quietly(port, baud)
    except Exception as error:  # noqa: BLE001
        last_error = error
        time.sleep(0.5)
if connection is None:
    print(f"[read-serial] could not open {port}: {last_error}")
    sys.exit(3)

deadline = time.time() + seconds
while time.time() < deadline:
    try:
        chunk = connection.readline()
    except Exception:  # noqa: BLE001 - a board that reset took its USB with it
        try:
            connection.close()
        except Exception:  # noqa: BLE001
            pass
        # Re-enumeration takes a moment; keep trying until the time is up.
        connection = None
        while connection is None and time.time() < deadline:
            time.sleep(0.5)
            try:
                connection = open_quietly(port, baud)
            except Exception:  # noqa: BLE001
                connection = None
        if connection is None:
            break
        continue
    if not chunk:
        continue
    print(chunk.decode("utf8", "replace").rstrip())
    sys.stdout.flush()

try:
    connection.close()
except Exception:  # noqa: BLE001
    pass
