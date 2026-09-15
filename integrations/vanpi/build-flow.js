// Builds the Node-RED tab "ScreenBee VanPi Bridge" (docs/2026-09-15-live-data.md,
// decision 1), in the shape Node-RED's admin API takes for a single flow:
// POST /flow and PUT /flow/:id with { id, label, info, nodes, configs }.
//
// As simple as the bridge can be, by the user's choice (2026-09-15): only
// Pekaway's official MQTT API, one polling interval for everything, and an
// immediate re-ask after every command so a switch still answers at once.
//
//   inject every N s -> "ask Pekaway" -> mqtt out pkw/stat/<kind>
//   mqtt in pkw/tele/+ -> "values" -> mqtt out screenbee/state/..., retained
//   mqtt in screenbee/cmnd/# -> "commands" -> mqtt out pkw/cmnd/..., not retained
//                                          -> 300 ms -> mqtt out pkw/stat/<kind>
//
// Every function node carries the whole of bridge-logic.js in its On Start
// code - the same text the e2e spec tests. The last published values live in
// flow context, shared by "values" (which writes them) and "commands" (which
// needs them for toggle and the heater target). The broker connection is a
// config node inside the tab, so removing the tab removes it too.

const { createBridgeLogic } = require("./bridge-logic")

const TAB_ID = "screenbee-vanpi-bridge"
const BROKER_ID = "screenbee-vanpi-bridge-broker"

const LOGIC_INIT = `${createBridgeLogic.toString()}
context.set("logic", createBridgeLogic());`

function buildBridgeFlow({ intervalSeconds = 2 } = {}) {
  const z = TAB_ID
  const nodes = [
    {
      id: "sbb-comment",
      type: "comment",
      z,
      name: "Installed by the ScreenBee designer - changes here are overwritten on its next update",
      info: "Asks Pekaway's MQTT API for its values and republishes each one retained under screenbee/state/..., and turns screenbee/cmnd/... commands into Pekaway's. See docs/2026-09-15-live-data.md in the screenbee-designer repository.",
      x: 360,
      y: 40,
      wires: [],
    },
    {
      id: "sbb-poll",
      type: "inject",
      z,
      name: `Ask Pekaway every ${intervalSeconds} s`,
      props: [],
      repeat: String(intervalSeconds),
      crontab: "",
      once: true,
      onceDelay: "5",
      topic: "",
      x: 170,
      y: 100,
      wires: [["sbb-requests"]],
    },
    {
      id: "sbb-requests",
      type: "function",
      z,
      name: "ask Pekaway",
      func: `const logic = context.get("logic");
return [logic.REQUESTS.map((kind) => ({ topic: "pkw/stat/" + kind, payload: "" }))];`,
      outputs: 1,
      timeout: 0,
      noerr: 0,
      initialize: LOGIC_INIT,
      finalize: "",
      libs: [],
      x: 390,
      y: 100,
      wires: [["sbb-stat-out"]],
    },
    {
      id: "sbb-stat-out",
      type: "mqtt out",
      z,
      name: "pkw/stat/<kind>",
      topic: "",
      qos: "0",
      retain: "false",
      respTopic: "",
      contentType: "",
      userProps: "",
      correl: "",
      expiry: "",
      broker: BROKER_ID,
      x: 620,
      y: 100,
      wires: [],
    },
    {
      id: "sbb-tele-in",
      type: "mqtt in",
      z,
      name: "Pekaway answers",
      topic: "pkw/tele/+",
      qos: "0",
      datatype: "utf8",
      broker: BROKER_ID,
      nl: false,
      rap: true,
      rh: 0,
      inputs: 0,
      x: 170,
      y: 180,
      wires: [["sbb-values"]],
    },
    {
      id: "sbb-values",
      type: "function",
      z,
      name: "values",
      func: `const logic = context.get("logic");
const kind = String(msg.topic).split("/")[2];
const result = logic.changed(flow.get("screenbeeState") || {}, logic.flatten(kind, msg.payload));
flow.set("screenbeeState", result.last);
node.status({ text: Object.keys(result.last).length + " values" });
if (result.changed.length === 0) return null;
return [result.changed.map((u) => ({ topic: u.topic, payload: u.value, retain: true }))];`,
      outputs: 1,
      timeout: 0,
      noerr: 0,
      initialize: LOGIC_INIT,
      finalize: "",
      libs: [],
      x: 390,
      y: 180,
      wires: [["sbb-state-out"]],
    },
    {
      id: "sbb-state-out",
      type: "mqtt out",
      z,
      name: "screenbee/state/..., retained",
      topic: "",
      qos: "0",
      retain: "true",
      respTopic: "",
      contentType: "",
      userProps: "",
      correl: "",
      expiry: "",
      broker: BROKER_ID,
      x: 650,
      y: 180,
      wires: [],
    },
    {
      id: "sbb-cmnd-in",
      type: "mqtt in",
      z,
      name: "ScreenBee commands",
      topic: "screenbee/cmnd/#",
      qos: "0",
      datatype: "utf8",
      broker: BROKER_ID,
      nl: false,
      rap: true,
      rh: 0,
      inputs: 0,
      x: 170,
      y: 260,
      wires: [["sbb-commands"]],
    },
    {
      id: "sbb-commands",
      type: "function",
      z,
      name: "commands",
      func: `const logic = context.get("logic");
const cmd = logic.command(msg.topic, msg.payload, flow.get("screenbeeState") || {});
if (!cmd) {
  node.status({ fill: "red", shape: "dot", text: "not understood: " + msg.topic + " = " + msg.payload });
  return null;
}
node.status({ text: msg.topic + " = " + msg.payload });
return [cmd.publish.map((p) => ({ topic: p.topic, payload: p.payload, retain: false })), { topic: "pkw/stat/" + cmd.refresh, payload: "" }];`,
      outputs: 2,
      timeout: 0,
      noerr: 0,
      initialize: LOGIC_INIT,
      finalize: "",
      libs: [],
      x: 390,
      y: 260,
      wires: [["sbb-cmnd-out"], ["sbb-refresh-delay"]],
    },
    {
      id: "sbb-cmnd-out",
      type: "mqtt out",
      z,
      name: "pkw/cmnd/..., not retained",
      topic: "",
      qos: "0",
      retain: "false",
      respTopic: "",
      contentType: "",
      userProps: "",
      correl: "",
      expiry: "",
      broker: BROKER_ID,
      x: 650,
      y: 240,
      wires: [],
    },
    {
      id: "sbb-refresh-delay",
      type: "delay",
      z,
      name: "then ask again",
      pauseType: "delay",
      timeout: "300",
      timeoutUnits: "milliseconds",
      rate: "1",
      nbRateUnits: "1",
      rateUnits: "second",
      randomFirst: "1",
      randomLast: "5",
      randomUnits: "seconds",
      drop: false,
      allowrate: false,
      outputs: 1,
      x: 630,
      y: 300,
      wires: [["sbb-stat-out"]],
    },
  ]

  const configs = [
    {
      id: BROKER_ID,
      type: "mqtt-broker",
      z,
      name: "ScreenBee bridge (local)",
      broker: "127.0.0.1",
      port: "1883",
      clientid: "",
      autoConnect: true,
      usetls: false,
      protocolVersion: "4",
      keepalive: "60",
      cleansession: true,
      autoUnsubscribe: true,
      birthTopic: "",
      birthQos: "0",
      birthPayload: "",
      closeTopic: "",
      closeQos: "0",
      closePayload: "",
      willTopic: "",
      willQos: "0",
      willPayload: "",
    },
  ]

  return {
    id: TAB_ID,
    label: "ScreenBee VanPi Bridge",
    info: "Installed and updated by the ScreenBee designer's install script (scripts/install-vanpi-bridge.js).",
    nodes,
    configs,
  }
}

module.exports = { buildBridgeFlow, TAB_ID, BROKER_ID }
