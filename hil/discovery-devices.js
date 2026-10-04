// Devices of other people's making, on the local broker (block plan
// Checkpoint B, 2026-10-01): the Home Assistant discovery configs the
// designer's tests read (e2e/fixtures/ha-discovery/), published retained
// under `homeassistant/` with a value on each state topic, so the Block menu
// at localhost:3000 lists them as it would on a broker with Zigbee2MQTT,
// ESPHome and the like on it. While it runs it answers every command the way
// the device would - the new state on the state topic - so a placed switch
// or slider can be tried in the preview. Ctrl+C clears the configs again.
//
// Run (with `npm run hil:broker` running):
//   node hil/discovery-devices.js            publish, answer, clear on exit
//   node hil/discovery-devices.js --clear    clear what an earlier run left
//
//   --broker <url>   default mqtt://localhost:1883, or $HIL_MQTT_URL

const path = require("path");
const mqtt = require("mqtt");

const args = process.argv.slice(2);
const brokerAt = args.indexOf("--broker");
const BROKER = brokerAt >= 0 ? args[brokerAt + 1] : process.env.HIL_MQTT_URL || "mqtt://localhost:1883";
const FIXTURES = path.join(__dirname, "..", "e2e", "fixtures", "ha-discovery");
const DESCRIPTIONS = path.join(__dirname, "..", "e2e", "fixtures", "block-descriptions");

// One of each kind the Block menu places, and one it cannot, to see why.
const DEVICES = [
  "z2m-switch-plug",
  "esphome-sensor-temperature",
  "ha-docs-fan-bedroom",
  "ha-docs-light-office",
  "esphome-select-mode",
  "z2m-number-calibration",
  "esphome-button-restart",
  "shelly-rpc-switch-command-template",
  // Covered in the Block menu by the garden pump's description below.
  "node-red-garden-pump-power",
];

// Block descriptions (docs/2026-10-04-bridge-blocks.md), on schaltli/blocks/:
// a device of somebody else's, described as a whole block.
const BLOCK_DESCRIPTIONS = ["garden-pump"];

// What each state topic holds at the start.
const VALUES = {
  "zigbee2mqtt/Kitchen plug": '{"state":"ON","power":12}',
  "van-sensors/sensor/cabin_temperature/state": "21.4",
  "bedroom_fan/on/state": "true",
  "bedroom_fan/speed/percentage_state": "4",
  "bedroom_fan/preset/preset_mode_state": "eco",
  "bedroom_fan/direction/state": "forward",
  "bedroom_fan/oscillation/state": "false",
  "office/light/status": "ON",
  "office/light/brightness": "180",
  "van-sensors/select/fan_mode/state": "Low",
  "zigbee2mqtt/Living room TRV": '{"local_temperature_calibration":-1.5}',
  "shellyplus1pm-441793a1b2c3/status/switch:0": '{"output":true}',
  "garden/pump/power": "on",
  "garden/pump/mode": "timer",
  "garden/pump/runtime": "20",
  "garden/pump/flow": "50",
};

// A command and the state it leads to: the same payload on the state topic,
// or - a Zigbee2MQTT device - a field of its JSON state.
const ANSWERS = {
  "zigbee2mqtt/Kitchen plug/set": (v) => ["zigbee2mqtt/Kitchen plug", JSON.stringify({ state: v, power: v === "ON" ? 12 : 0 })],
  "zigbee2mqtt/Living room TRV/set/local_temperature_calibration": (v) => [
    "zigbee2mqtt/Living room TRV",
    JSON.stringify({ local_temperature_calibration: Number(v) }),
  ],
  "bedroom_fan/on/set": (v) => ["bedroom_fan/on/state", v],
  "bedroom_fan/speed/percentage": (v) => ["bedroom_fan/speed/percentage_state", v],
  "bedroom_fan/preset/preset_mode": (v) => ["bedroom_fan/preset/preset_mode_state", v],
  "bedroom_fan/direction/set": (v) => ["bedroom_fan/direction/state", v],
  "bedroom_fan/oscillation/set": (v) => ["bedroom_fan/oscillation/state", v],
  "office/light/switch": (v) => ["office/light/status", v],
  "office/light/brightness/set": (v) => ["office/light/brightness", v],
  "van-sensors/select/fan_mode/command": (v) => ["van-sensors/select/fan_mode/state", v],
  "garden/pump/power/set": (v) => ["garden/pump/power", v],
  "garden/pump/mode/set": (v) => ["garden/pump/mode", v],
  "garden/pump/runtime/set": (v) => ["garden/pump/runtime", v],
  "garden/pump/flow/set": (v) => ["garden/pump/flow", v],
};

const configs = [
  ...DEVICES.map((name) => require(path.join(FIXTURES, `${name}.json`))),
  ...BLOCK_DESCRIPTIONS.map((name) => require(path.join(DESCRIPTIONS, `${name}.json`))),
];
const client = mqtt.connect(BROKER, { clientId: `discovery-devices-${Date.now()}` });

function publish(topic, payload) {
  return new Promise((resolve, reject) => client.publish(topic, payload, { retain: true, qos: 1 }, (e) => (e ? reject(e) : resolve())));
}

async function clear() {
  for (const f of configs) await publish(f.topic, "");
  console.log(`Cleared ${configs.length} configs.`);
}

client.on("error", (e) => {
  console.error(`No broker at ${BROKER}: ${e.message}. Is \`npm run hil:broker\` running?`);
  process.exit(1);
});

client.on("connect", async () => {
  if (args.includes("--clear")) {
    await clear();
    client.end();
    return;
  }
  for (const f of configs) await publish(f.topic, JSON.stringify(f.payload));
  for (const [topic, value] of Object.entries(VALUES)) await publish(topic, value);
  console.log(`Announced on ${BROKER} under homeassistant/ and schaltli/blocks/:`);
  for (const f of configs) console.log(`  ${f.topic}`);

  client.subscribe(Object.keys(ANSWERS));
  client.on("message", (topic, message) => {
    const answer = ANSWERS[topic];
    if (!answer) return;
    const [state, value] = answer(message.toString());
    console.log(`${topic} ${message} -> ${state} ${value}`);
    publish(state, value);
  });
  console.log("Answering commands. Ctrl+C clears the configs.");
});

process.on("SIGINT", async () => {
  await clear();
  client.end(false, () => process.exit(0));
});
