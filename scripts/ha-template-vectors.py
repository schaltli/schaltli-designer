#!/usr/bin/env python3
"""Renders the cases of lib/ha-template/vectors.json with Jinja itself.

lib/ha-template.ts evaluates Home Assistant's templates in the designer
(docs/2026-10-26-ha-templates.md). Its expected results must not come from
its own code, so this script renders each case with Jinja2 and Home
Assistant's filters as Home Assistant defines them
(homeassistant/helpers/template/extensions/{math,type_cast,serialization}.py,
2026-10-26), and writes what came out - or that it failed - beside it.

    python -m pip install jinja2
    python scripts/ha-template-vectors.py

A case gives `payload` (rendered as a value template: `value`, and
`value_json` where it is JSON) or `variables`. Add a case to CASES and run
the script again; e2e/ha-template.spec.ts runs them all.
"""

import json
import math
import os

import jinja2

_SENTINEL = object()


class TemplateFailed(Exception):
    pass


def _fail(name, value):
    raise TemplateFailed(f"{name}({value!r})")


def forgiving_float(value, default=_SENTINEL):
    try:
        return float(value)
    except (ValueError, TypeError, OverflowError):
        if default is _SENTINEL:
            _fail("float", value)
        return default


def forgiving_int(value, default=_SENTINEL, base=10):
    try:
        result = jinja2.filters.do_int(value, default=default, base=base)
    except OverflowError:
        result = default
    if result is _SENTINEL:
        _fail("int", value)
    return result


def forgiving_round(value, precision=0, method="common", default=_SENTINEL):
    try:
        multiplier = float(10**precision)
        if method == "ceil":
            value = math.ceil(float(value) * multiplier) / multiplier
        elif method == "floor":
            value = math.floor(float(value) * multiplier) / multiplier
        elif method == "half":
            value = round(float(value) * 2) / 2
        else:
            value = round(float(value), precision)
        return int(value) if precision == 0 else value
    except (ValueError, TypeError, OverflowError):
        if default is _SENTINEL:
            _fail("round", value)
        return default


def multiply(value, amount, default=_SENTINEL):
    try:
        return float(value) * amount
    except (ValueError, TypeError, OverflowError):
        if default is _SENTINEL:
            _fail("multiply", value)
        return default


def add(value, amount, default=_SENTINEL):
    try:
        return float(value) + amount
    except (ValueError, TypeError, OverflowError):
        if default is _SENTINEL:
            _fail("add", value)
        return default


def forgiving_boolean(value, default=_SENTINEL):
    # cv.boolean
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        v = value.lower().strip()
        if v in ("1", "true", "yes", "on", "enable"):
            return True
        if v in ("0", "false", "no", "off", "disable"):
            return False
    elif isinstance(value, (int, float)):
        return value != 0
    if default is _SENTINEL:
        _fail("bool", value)
    return default


def is_number(value):
    try:
        fvalue = float(value)
    except (ValueError, TypeError, OverflowError):
        return False
    return math.isfinite(fvalue)


def to_json(value, ensure_ascii=False, pretty_print=False, sort_keys=False):
    # orjson: compact, as written, non-ASCII as it is.
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=sort_keys)


def min_max(fn):
    def call(*args):
        if len(args) == 1 and isinstance(args[0], (list, tuple)):
            return fn(args[0])
        return fn(args)

    return call


env = jinja2.Environment()
env.filters.update(
    float=forgiving_float,
    int=forgiving_int,
    round=forgiving_round,
    multiply=multiply,
    add=add,
    bool=forgiving_boolean,
    is_number=is_number,
    to_json=to_json,
)
env.globals.update(
    float=forgiving_float,
    int=forgiving_int,
    bool=forgiving_boolean,
    is_number=is_number,
    min=min_max(min),
    max=min_max(max),
)
env.tests["is_number"] = is_number

CASES = [
    # Paths, as readPath reads them too.
    {"template": "{{ value_json.temperature }}", "payload": '{"temperature": 21.5}'},
    {"template": '{{ value_json["a b"] }}', "payload": '{"a b": "x"}'},
    {"template": "{{ value_json.list[1] }}", "payload": '{"list": [1, 2.0]}'},
    {"template": "{{ value_json.missing }}", "payload": "{}"},
    {"template": "{{ value_json.a.b }}", "payload": "{}"},
    {"template": "{{ value }}", "payload": "ON"},
    # Python's numbers and text.
    {"template": "{{ 7 / 2 }} {{ 4 / 2 }} {{ 7 // 2 }} {{ -7 // 2 }} {{ -7 % 3 }} {{ 2 ** 10 }}", "variables": {}},
    {"template": "{{ 0.1 + 0.2 }} {{ 1e-5 }} {{ 1e16 }} {{ 123456789012345678.0 }} {{ 1.5e300 * 1.0 }}", "variables": {}},
    {"template": "{{ True }} {{ None }} {{ [1, 'a', None] }} {{ {'a': 1} }}", "variables": {}},
    {"template": "{{ 1 == True }} {{ 0 == False }} {{ '1' == 1 }} {{ 1.0 == 1 }}", "variables": {}},
    {"template": "{{ 'a' ~ 1 ~ True }} {{ 'ab' + 'c' }}", "variables": {}},
    {"template": "{{ 'a' < 1 }}", "variables": {}},
    {"template": "{{ x }}|{{ x | default('d') }}|{{ '' | default('e', true) }}", "variables": {}},
    # Home Assistant's filters.
    {"template": "{{ 2.5 | round }} {{ 3.5 | round }} {{ 2.675 | round(2) }} {{ 21.437 | round(1) }} {{ '7' | round }}", "variables": {}},
    {"template": "{{ 21.44 | round(1, 'floor') }} {{ 21.41 | round(1, 'ceil') }} {{ 21.3 | round(0, 'half') }}", "variables": {}},
    {"template": "{{ 'abc' | float }}", "variables": {}},
    {"template": "{{ 'abc' | float(0) }} {{ '1.7' | int }} {{ 3.9 | int }} {{ true | int }}", "variables": {}},
    {"template": "{{ 'abc' | int }}", "variables": {}},
    {"template": "{{ 50 | multiply(2.55) | round(0) }} {{ 10 | add(0.5) }}", "variables": {}},
    {"template": "{{ 'on' | bool }} {{ 'no' | bool }} {{ 0 | bool }} {{ 'x' | bool(false) }}", "variables": {}},
    {"template": "{{ is_number('1.5') }} {{ 'x' is is_number }} {{ float('2') }} {{ max(1, 3, 2) }} {{ [4, 1] | min }}", "variables": {}},
    {"template": "{{ {'b': 1, 'a': 'ü<'} | tojson }} {{ {'b': 1, 'a': 'ü<'} | to_json }}", "variables": {}},
    {"template": "{{ value_json | to_json }}", "payload": '{"z": 1.0, "a": [true, null]}'},
    # Tests, conditions, blocks, whitespace control.
    {"template": "{{ value_json.x is defined }} {{ value_json.y is not defined }} {{ value_json.x is number }} {{ none is none }}", "payload": '{"x": 1}'},
    {"template": "{{ 'on' if value_json.output else 'off' }}", "payload": '{"output": false}'},
    {"template": "{{ 'yes' if value == 'ON' }}|", "variables": {"value": "OFF"}},
    {"template": "{% if value_json.output %}ON{% else %}OFF{% endif %}", "payload": '{"output": true}'},
    {"template": "{%if value_json.effect==1%}Meteor Shower{%elif value_json.effect==2%}Gradual Change{%else%}Off{%endif%}", "payload": '{"effect": 2}'},
    {"template": "  {%- if value == 'a' -%}  A  {%- endif -%}  !", "variables": {"value": "a"}},
    {"template": "{% set v = value | float * 10 %}{{ v }}{# a comment #}", "variables": {"value": "1.5"}},
    {"template": "{{ 'x' in value_json }} {{ 2 in value_json.l }} {{ 'b' not in 'abc' }} {{ value_json.get('x') }} {{ value_json.get('n', 5) }}", "payload": '{"x": "y", "l": [1, 2]}'},
    # Command templates as the survey found them.
    {"template": '{"interval":{{value*1000}}}', "variables": {"value": 30}},
    {"template": '{"gain":{{value|float|multiply(0.3922)|round(0)}}}', "variables": {"value": 255}},
    {
        "template": '{%if value=="ON"%}{"id":1,"src":"shellies/s","method":"Switch.Set","params":{"id":0,"on":true}}{%else%}{"id":1,"src":"shellies/s","method":"Switch.Set","params":{"id":0,"on":false}}{%endif%}',
        "variables": {"value": "OFF"},
    },
    {
        "template": '{%if value=="off"%}{%set output=false%}{%else%}{%set output=true%}{%endif%}{{ {"id":1,"src":"s","method":"Boolean.Set","params":{"id":202,"value":output}}|tojson }}',
        "variables": {"value": "heat"},
    },
    {
        "template": '{%if value=="fan_only"%}{%set value="ventilation"%}{%endif%}{{ {"id":1,"method":"Enum.Set","params":{"id":201,"value":value}}|tojson }}',
        "variables": {"value": "fan_only"},
    },
    {"template": '{ "action": "{{ value }}", "code":"{{ code }}" }', "variables": {"value": "LOCK"}},
    {"template": "{{ ((float(value) * 99)|round(0)) + 1 }}", "variables": {"value": "0.5"}},
    {"template": '{{ "OFF" if value_json.value == 0 else "ON" }}', "payload": '{"value": 255}'},
    # What the subset refuses: these must say so, not render.
    {"template": "{% for x in [1, 2] %}{{ x }}{% endfor %}", "variables": {}, "unsupported": True},
    {"template": "{{ states('sensor.x') }}", "variables": {}, "unsupported": True},
    {"template": "{{ value | regex_replace('a', 'b') }}", "variables": {"value": "a"}, "unsupported": True},
    {"template": "{{ value.split(',')[0] }}", "variables": {"value": "a,b"}, "unsupported": True},
]


def render(case):
    if "payload" in case:
        variables = {"value": case["payload"]}
        try:
            variables["value_json"] = json.loads(case["payload"])
        except ValueError:
            pass
    else:
        variables = case["variables"]
    try:
        return {"result": env.from_string(case["template"]).render(**variables)}
    except (TemplateFailed, jinja2.TemplateError, TypeError, ValueError, ZeroDivisionError) as e:
        return {"error": type(e).__name__}


def main():
    out = []
    for case in CASES:
        entry = dict(case)
        if not case.get("unsupported"):
            entry.update(render(case))
        out.append(entry)
    path = os.path.join(os.path.dirname(__file__), "..", "lib", "ha-template", "vectors.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(
            {
                "about": "Home Assistant templates rendered by Jinja2 "
                + jinja2.__version__
                + " with Home Assistant's filters (scripts/ha-template-vectors.py); "
                + "lib/ha-template.ts must agree (e2e/ha-template.spec.ts).",
                "cases": out,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
        f.write("\n")


if __name__ == "__main__":
    main()
