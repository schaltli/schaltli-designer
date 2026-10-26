#!/usr/bin/env python3
"""Computes the cases of lib/scaled-value/vectors.json with exact fractions.

lib/scaled-value.ts, the firmware's ScaledValue and the app's ScaledValue.kt
scale a value by a fraction and an offset (tasks/ha-templates-stage2-plan.md,
decision 1). Their expected results must not come from any of them, so this
script computes each case with Python's Fraction and rounds half away from
zero, applying the same bounds, and writes the result - or null for no value -
beside it.

    python scripts/scaled-value-vectors.py

Add a case to SCALE or WRITE and run the script again; e2e/scaled-value.spec.ts,
the firmware's test_scaled_value and the app's ScaledValueTest run them all.
"""

import json
import os
import re
from fractions import Fraction

MAX_FACTOR = 1_000_000
LIMIT = 10**12


def plain_decimal(text, max_significant, max_fraction):
    m = re.fullmatch(r" *([+-]?)(\d*)(?:\.(\d*))? *", text)
    if not m or (m.group(2) == "" and not m.group(3)):
        return None
    whole, fraction = m.group(2), m.group(3) or ""
    if len(fraction) > max_fraction:
        return None
    digits = (whole + fraction).lstrip("0") or "0"
    if len(digits) > max_significant:
        return None
    value = Fraction(int(whole + fraction or "0"), 10 ** len(fraction))
    return (-value if m.group(1) == "-" else value), len(fraction)


def half_away(x):
    n = abs(x)
    whole = n.numerator // n.denominator
    if (n - whole) * 2 >= 1:
        whole += 1
    return -whole if x < 0 else whole


def text(units, decimals):
    sign = "-" if units < 0 else ""
    digits = str(abs(units)).rjust(decimals + 1, "0")
    whole, fraction = digits[: len(digits) - decimals], digits[len(digits) - decimals :]
    return sign + whole + ("." + fraction if decimals else "")


def scale(value, numerator, denominator, offset="0", decimals=0):
    if not (1 <= denominator <= MAX_FACTOR and -MAX_FACTOR <= numerator <= MAX_FACTOR and 0 <= decimals <= 6):
        return None
    off = plain_decimal(offset, 18, 6)
    if off is None or off[1] > decimals or abs(int(off[0])) >= LIMIT:
        return None
    v = plain_decimal(value, 12, 9)
    if v is None:
        return None
    product = v[0] * Fraction(numerator, denominator)
    if abs(product) >= LIMIT:
        return None
    units = half_away((product + off[0]) * 10**decimals)
    if abs(units) >= LIMIT * 10**decimals:
        return None
    return text(units, decimals)


def write(value, fmt):
    put = value
    if any(k in fmt for k in ("numerator", "denominator", "offset")):
        put = scale(value, fmt.get("numerator", 1), fmt.get("denominator", 1), fmt.get("offset", "0"), fmt.get("decimals", 0))
        if put is None:
            return None
    return fmt["text"].replace("{value}", put)


# (value, numerator, denominator, offset, decimals)
SCALE = [
    # The survey's: rtl_433 m/s to km/h, OpenMQTTGateway ms to s and min, Shelly's 0-255 to percent.
    ("12.5", 18, 5, "0", 2),
    ("30000", 1, 1000, "0", 0),
    ("90000", 1, 60000, "0", 1),
    ("128", 20, 51, "0", 0),
    ("100", 1961, 5000, "0", 0),
    ("294.15", 1, 1, "-273.15", 2),
    ("21.437", 1, 1, "0", 1),
    # Rounding at the half, both ways, and just off it.
    ("0.5", 1, 1, "0", 0),
    ("-0.5", 1, 1, "0", 0),
    ("2.5", 1, 1, "0", 0),
    ("1.005", 1, 1, "0", 2),
    ("-1.005", 1, 1, "0", 2),
    ("1", 1, 3, "0", 6),
    ("2", 1, 3, "0", 6),
    ("-2", 1, 3, "0", 6),
    ("1", 1, 8, "0", 2),
    ("-1", 1, 8, "0", 2),
    # Signs: a negative value, factor and offset; crossing zero; never "-0".
    ("-10", 3, 1, "5", 0),
    ("10", -3, 1, "5", 0),
    ("-0.001", 1, 1, "0", 2),
    ("0.004", -1, 1, "0", 2),
    ("1", 1, 1, "-1.5", 1),
    ("1", 1, 3, "-0.4", 1),
    ("-1", 1, 3, "0.4", 1),
    ("0", 5, 7, "0", 3),
    # Spellings of a plain decimal.
    ("+7", 1, 1, "0", 0),
    (".5", 2, 1, "0", 1),
    ("5.", 2, 1, "0", 0),
    ("  42  ", 1, 1, "0", 0),
    ("007.50", 2, 1, "0", 2),
    # Not a plain decimal: no value.
    ("", 1, 1, "0", 0),
    ("abc", 1, 1, "0", 0),
    ("1e3", 1, 1, "0", 0),
    ("1,5", 1, 1, "0", 0),
    ("-", 1, 1, "0", 0),
    (".", 1, 1, "0", 0),
    ("true", 1, 1, "0", 0),
    # The bounds, and one past each.
    ("999999999999", 1, 1, "0", 0),
    ("9999999999999", 1, 1, "0", 0),
    ("0.000000001", 1000000, 1, "0", 3),
    ("0.0000000001", 1, 1, "0", 0),
    ("999999999999", 1000000, 1, "0", 0),
    ("999999.999999", 1000000, 1, "0", 6),
    ("999999.999999", 1, 1000000, "0", 6),
    ("1", 1000001, 1, "0", 0),
    ("1", 1, 1000001, "0", 0),
    ("1", 1, 0, "0", 0),
    ("1", 1, 1, "0", 7),
    ("1", 1, 1, "0.123", 2),
    ("1", 1, 1, "999999999999", 0),
    ("1", 1, 1, "1000000000000", 0),
    ("1", 1, 1, "x", 0),
]

WRITE = [
    ("30", {"text": '{"interval":{value}}', "numerator": 1000}),
    ("50", {"text": '{"gain":{value}}', "numerator": 1961, "denominator": 5000, "decimals": 0}),
    ("21.5", {"text": '{"id":1,"method":"Number.Set","params":{"id":200,"value":{value}}}'}),
    ("21.5", {"text": "{value}"}),
    ("7", {"text": "set {value} and {value}"}),
    ("7", {"text": "{{value}} {val} {value"}),
    ("abc", {"text": "{value}"}),
    ("abc", {"text": "{value}", "numerator": 2}),
    ("1.25", {"text": "{value}", "offset": "0.5", "decimals": 1}),
]


def main():
    cases = {
        "scale": [
            {"value": v, "numerator": n, "denominator": d, "offset": o, "decimals": k, "result": scale(v, n, d, o, k)}
            for (v, n, d, o, k) in SCALE
        ],
        "write": [{"value": v, "format": f, "result": write(v, f)} for (v, f) in WRITE],
    }
    path = os.path.join(os.path.dirname(__file__), "..", "lib", "scaled-value", "vectors.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(
            {
                "about": "Scaled values computed with exact fractions, rounded half away from zero "
                + "(scripts/scaled-value-vectors.py); lib/scaled-value.ts, the firmware's ScaledValue "
                + "and the app's ScaledValue.kt must agree. result null: no value.",
                **cases,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
        f.write("\n")


if __name__ == "__main__":
    main()
