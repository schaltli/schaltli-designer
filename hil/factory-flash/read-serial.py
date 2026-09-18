"""Read a board's serial output for a while and print it.

Node has no serial support of its own, and pulling a package in for one HIL
step would put a native dependency in the designer's install. PlatformIO's
environment already ships pyserial (esptool needs it), and that is the same
environment this suite flashes with - so the boot output is read with that.

  python read-serial.py COM7 25 [115200]

Prints every line it sees, prefixed, and exits when the seconds are up. A port
that cannot be opened is not an error here: run.js decides what that means.
"""

import sys
import time

import serial

port = sys.argv[1]
seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 25.0
baud = int(sys.argv[3]) if len(sys.argv) > 3 else 115200

try:
    connection = serial.Serial(port, baud, timeout=0.5)
except Exception as error:  # noqa: BLE001 - the caller reports this
    print(f"[read-serial] could not open {port}: {error}")
    sys.exit(3)

deadline = time.time() + seconds
with connection:
    while time.time() < deadline:
        try:
            chunk = connection.readline()
        except Exception as error:  # noqa: BLE001
            print(f"[read-serial] read failed: {error}")
            sys.exit(4)
        if not chunk:
            continue
        print(chunk.decode("utf8", "replace").rstrip())
        sys.stdout.flush()
