# Templates in Home Assistant discovery: what is out there

Asked for by the user on 2026-10-26, before deciding how much of Jinja the
designer and the devices should understand. Today the designer follows only
no template, `{{ value }}` and a path into the JSON (`{{ value_json.a.b }}`,
`{{ value_json["a"] }}`); everything else leaves a part read-only or the
entity unsupported (lib/ha-discovery.ts).

## Sources

Counted on 2026-10-26 with `docs/2026-10-26-template-survey/count-templates.js`:

- the van: every retained `homeassistant/…/config` on the Pekaway broker
  (192.168.8.107), 104 configs;
- the discovery code of Zigbee2MQTT (`lib/extension/homeassistant.ts`),
  Tasmota (`xdrv_12_home_assistant.ino`, `xsns_62_esp32_mi_ble.ino`),
  ESPHome (`mqtt_cover.cpp`, the only MQTT component with templates),
  OpenMQTTGateway (`main/mqttDiscovery.cpp`), Theengs Gateway, rtl_433
  (`rtl_433_mqtt_hass.py`), Z-Wave JS UI, ebusd (`mqtt-hassio.cfg`) and
  the Shelly discovery scripts for Home Assistant (bieniu's
  `ha-shellies-discovery`, gen1 and gen2).

What is counted from source code is the places a template is written, not
the entities announced in the wild: one Zigbee2MQTT line
`{{ value_json["…"] }}` stands for most of its sensors and switches on every
network. The numbers say which constructs occur, not how often a user meets
them.

## Findings

**The van: 103 of 104 configs have no template at all.** The one that has
reads another entity (`states('sensor.…_uptime_s')`), which only Home
Assistant can do.

**Reading** (`value_template` and its kin), by what a template needs:

| Needs | Where |
| --- | --- |
| nothing, a JSON path | most of Zigbee2MQTT, ESPHome, OpenMQTTGateway, Z-Wave JS, Tasmota sensors, about a third of Shelly gen2 |
| arithmetic and number filters: `float`, `int`, `round`, `multiply`, `/ 1000`, `* 3.6` | all of rtl_433, OpenMQTTGateway's intervals and brightness, Shelly's brightness, Tasmota's BLE sensors |
| `a if cond else b`, comparisons, `default` | Z-Wave JS (`"OFF" if value_json.value == 0 else "ON"`), Tasmota BLE, Zigbee2MQTT |
| `{% if %}…{% elif %}…{% endif %}`, `{% set %}` | Shelly gen1 and gen2 (states, effects), Zigbee2MQTT covers and thermostats, Theengs |
| several values in one text: `{{ value_json.r }},{{ value_json.g }}` | colour lights of Shelly and Z-Wave JS |
| Home Assistant only: `states()`, `now()`, `as_timestamp`, `timestamp_local` | the van's one, a few in Shelly and Zigbee2MQTT |
| more of Jinja: `regex_replace`, `selectattr`, `map`, `namespace`, `zip`, `.split()` | ebusd's firmware version, a few in Zigbee2MQTT and Tasmota |

**Writing** (`command_template`, `set_position_template` …) is rarer and
nearly always builds a JSON body around the value:

- `{"interval": {{ value * 1000 }}}`, `{"brightness": {{ value }}}`
  (OpenMQTTGateway), `{ "position": {{ position }} }` (Zigbee2MQTT covers);
- Shelly gen2 RPC: `{"id":1,"src":"…","method":"Number.Set","params":{"id":200,"value":{{ value }}}}`,
  its switches with `{% if value == "ON" %}…"on":true…{% else %}…"on":false…{% endif %}`;
- scaling: `{"gain": {{ value | float | multiply(0.3922) | round(0) }}}` (Shelly gen1);
- a value mapped: `{% if value == "Off" %}"effect":0{% elif … %}` (Shelly gen1 effects);
- Z-Wave JS colour temperature: `min`, `max`, `{% set %}` and `to_json` of a dict.

Templates use more variables than `value`: a cover's `position` (the
percentage, where `value` is the position in the cover's own range) and
`tilt_position`, a siren's `tone`, `duration` and `volume_level`, a light's
`red`, `green`, `blue`.

## What follows

1. **A write with few inputs needs no device at all.** A switch has two
   values, a button one, a select, a lock or a mode a known list. The
   designer can render the template itself for each of them and give the
   device the finished payloads, as it does today without a template. That
   alone makes Shelly gen2 switches and modes, Shelly gen1 effects and every
   `{% if value == … %}` command work. A Jinja subset in the designer's
   TypeScript is enough.
2. **Reading, and writing a number, needs the device.** The value comes at
   run time: an expression the device evaluates. What occurs is small:
   literals, `value`, `value_json` with paths, `position`, arithmetic,
   comparisons, `and`/`or`/`not`, `x if c else y`, the filters `float`,
   `int`, `round`, `default`, `multiply`, `lower`, `upper`, `string`,
   `bool`, `min`, `max`, `tojson`, text around expressions, and
   `{% if %}`/`{% set %}`. Parsed once in the designer into a tree, the
   devices (firmware and Android) only evaluate it.
3. **Never on a device:** `states()`, `now()` and the like, which need Home
   Assistant itself. They stay unsupported with their reason.
