// Builds the Node-RED tab "Schaltli VanPi Bridge" (docs/2026-09-15-live-data.md,
// decision 1), in the shape Node-RED's admin API takes for a single flow:
// POST /flow and PUT /flow/:id with { id, label, info, nodes, configs }.
//
// As simple as the bridge can be, by the user's choice (2026-09-15): only
// Pekaway's official MQTT API, one polling interval for everything, and an
// immediate re-ask after every command so a switch still answers at once.
//
//   inject every N s -> "ask Pekaway" -> mqtt out pkw/stat/<kind>
//   mqtt in pkw/tele/+ -> "values" -> mqtt out schaltli/state/... and
//                                    homeassistant/.../config and
//                                    schaltli/blocks/<id>/config, retained
//   mqtt in schaltli/cmnd/# -> "commands" -> mqtt out pkw/cmnd/..., not retained
//                                          -> http request, Pekaway's HTTP API
//                                          -> 300 ms -> mqtt out pkw/stat/<kind>
//
// The HTTP request is for an Autoterm only, the one exception to "only
// Pekaway's official MQTT API" (decided by the user 2026-10-05): that API
// cannot start an Autoterm to a temperature nor stop it - pkw/cmnd/heater/POWER
// reaches only the generic heater (tried in the van that day). Every Autoterm
// command takes Pekaway's HTTP API, its levels too, so there is one way for
// it; Pekaway's own app API calls the same /autoterm/... URLs.
//
// Every function node carries the whole of bridge-logic.js in its On Start
// code - the same text the e2e spec tests. The last published values live in
// flow context, shared by "values" (which writes them) and "commands" (which
// needs them for toggle and the heater target). The broker connection is a
// config node inside the tab, so removing the tab removes it too.

const { createBridgeLogic } = require("./bridge-logic")

const TAB_ID = "schaltli-vanpi-bridge"
const BROKER_ID = "schaltli-vanpi-bridge-broker"

const LOGIC_INIT = `${createBridgeLogic.toString()}
context.set("logic", createBridgeLogic());`

// tabId: the id Node-RED gave an installed tab, for an update. Node-RED
// ignores the id sent with POST /flow and assigns its own, so only a first
// install uses TAB_ID; scripts/install-vanpi-bridge.js finds the real one.
function buildBridgeFlow({ intervalSeconds = 2, tabId = TAB_ID } = {}) {
  const z = tabId
  const nodes = [
    {
      id: "sbb-comment",
      type: "comment",
      z,
      name: "Installed by the Schaltli designer - changes here are overwritten on its next update",
      info: "Asks Pekaway's MQTT API for its values and republishes each one retained under schaltli/state/..., and turns schaltli/cmnd/... commands into Pekaway's. See docs/2026-09-15-live-data.md in the schaltli-designer repository.",
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
// A dimmer level just commanded outlives an answer that is still behind it.
let answer = logic.held(logic.flatten(kind, msg.payload, flow.get("schaltliState") || {}), flow.get("schaltliHolds") || {}, Date.now());
if (kind === "heater") {
  // The minutes left of a timer, counted here where the van does not say.
  const t = logic.heaterTimer(answer, flow.get("schaltliTimer") || null, Date.now());
  flow.set("schaltliTimer", t.timer);
  answer = t.updates;
  // An Autoterm's target or runtime set while it cannot take them: the bridge's.
  const k = logic.keptValues(answer, flow.get("schaltliKept") || null);
  flow.set("schaltliKept", k.kept);
  answer = k.updates;
  // The fuel an Autoterm used, counted from its pump's frequency.
  const f = logic.fuelCount(answer, flow.get("schaltliFuel") || null, Date.now());
  flow.set("schaltliFuel", f.fuel);
  answer = f.updates;
  // A command Pekaway refused, a start the heater did not follow.
  const b = logic.bridgeFaults(answer, flow.get("schaltliFaults") || null, Date.now());
  flow.set("schaltliFaults", b.faults);
  answer = b.updates;
}
const result = logic.changed(flow.get("schaltliState") || {}, answer);
flow.set("schaltliState", result.last);
// What the answer reports, announced for Home Assistant's discovery: new or
// renamed things published, gone ones cleared. The theme is the bridge's own
// and announced with the first answer.
let announced = flow.get("schaltliAnnounced") || {};
const configs = [];
for (const k of [kind, "theme"]) {
  const a = logic.announce(k, msg.payload, announced);
  announced = a.announced;
  configs.push(...a.publish);
}
flow.set("schaltliAnnounced", announced);
node.status({ text: Object.keys(result.last).length + " values" });
const out = result.changed.map((u) => ({ topic: u.topic, payload: u.value, retain: true }));
for (const c of configs) out.push({ topic: c.topic, payload: c.payload, retain: true });
if (out.length === 0) return null;
return [out];`,
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
      name: "schaltli/state/..., retained",
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
      name: "Schaltli commands",
      topic: "schaltli/cmnd/#",
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
const cmd = logic.command(msg.topic, msg.payload, flow.get("schaltliState") || {});
if (!cmd) {
  node.status({ fill: "red", shape: "dot", text: "not understood: " + msg.topic + " = " + msg.payload });
  return null;
}
if (cmd.elsewhere) {
  node.status({ text: msg.topic + " = " + msg.payload + ", for " + cmd.elsewhere });
  return null;
}
node.status({ text: msg.topic + " = " + msg.payload });
if (cmd.fuelReset) {
  // The fuel used from zero, now: the bridge's own count.
  const r = logic.fuelReset(flow.get("schaltliFuel") || null, Date.now());
  flow.set("schaltliFuel", r.fuel);
  const result = logic.changed(flow.get("schaltliState") || {}, r.updates);
  flow.set("schaltliState", result.last);
  return [null, null, result.changed.map((u) => ({ topic: u.topic, payload: u.value, retain: true })), null];
}
// A heater timer started or stopped: counted down from now (values).
if (cmd.timer) flow.set("schaltliTimer", logic.startTimer(cmd.timer, Date.now()));
// An Autoterm's target or runtime kept until it is started with them (values).
if (cmd.keep) flow.set("schaltliKept", logic.keepValues(flow.get("schaltliKept") || null, cmd.keep, flow.get("schaltliState") || {}));
const out = [null, null, null, null];
if (cmd.state) {
  // A value the bridge keeps itself (the theme), or a dimmer level shown as
  // soon as it is asked for, the way Pekaway's own dashboard shows it:
  // published retained, like every state, and only when it changes.
  if (cmd.hold) flow.set("schaltliHolds", logic.hold(flow.get("schaltliHolds") || {}, cmd.state, Date.now()));
  const result = logic.changed(flow.get("schaltliState") || {}, cmd.state);
  flow.set("schaltliState", result.last);
  if (result.changed.length > 0) out[2] = result.changed.map((u) => ({ topic: u.topic, payload: u.value, retain: true }));
}
if (cmd.request) {
  out[3] = cmd.request.map((r) => ({ method: r.method, url: r.url, payload: "" }));
  // A start is watched until the heater follows it (values).
  flow.set("schaltliFaults", logic.commandSent(flow.get("schaltliFaults") || null, cmd.request[cmd.request.length - 1], Date.now()));
}
if (cmd.publish || cmd.request) {
  if (cmd.publish) out[0] = cmd.publish.map((p) => ({ topic: p.topic, payload: p.payload, retain: false }));
  const ask = { topic: "pkw/stat/" + cmd.refresh, payload: "" };
  if (cmd.hold) {
    // A dimmer being dragged sends ten levels a second. Asking Pekaway for
    // its whole dimmer state after each of them jammed Node-RED on the van:
    // the commands queued up and reached the lamp in bursts, so the light
    // stopped following the finger (2026-09-27). The level is already shown
    // (out[2]); Pekaway is asked once, when the commands stop.
    clearTimeout(context.get("askTimer"));
    context.set("askTimer", setTimeout(() => node.send([null, ask, null]), 100));
  } else {
    out[1] = ask;
  }
}
if (!out[0] && !out[2] && !out[3]) return null;
return out;`,
      outputs: 4,
      timeout: 0,
      noerr: 0,
      initialize: LOGIC_INIT,
      finalize: "",
      libs: [],
      x: 390,
      y: 260,
      wires: [["sbb-cmnd-out"], ["sbb-refresh-delay"], ["sbb-state-out"], ["sbb-http-out"]],
    },
    {
      id: "sbb-http-out",
      type: "http request",
      z,
      name: "Pekaway's HTTP API (Autoterm)",
      method: "use",
      ret: "txt",
      paytoqs: "ignore",
      url: "",
      tls: "",
      persist: false,
      proxy: "",
      insecureHTTPParser: false,
      authType: "",
      senderr: false,
      headers: [],
      x: 680,
      y: 360,
      wires: [["sbb-http-answer"]],
    },
    {
      id: "sbb-http-answer",
      type: "function",
      z,
      name: "what Pekaway answered",
      func: `const logic = context.get("logic");
// Refused or unanswered: a fault on the heater until a command is taken.
const fault = logic.commandAnswer(msg.statusCode, msg.payload);
const faults = flow.get("schaltliFaults") || { command: "", startAt: null };
flow.set("schaltliFaults", { command: fault, startAt: faults.startAt });
node.status(fault ? { fill: "red", shape: "dot", text: fault } : { text: String(msg.payload).slice(0, 60) });
return null;`,
      outputs: 0,
      timeout: 0,
      noerr: 0,
      initialize: LOGIC_INIT,
      finalize: "",
      libs: [],
      x: 920,
      y: 360,
      wires: [],
    },
    {
      id: "sbb-theme-in",
      type: "mqtt in",
      z,
      name: "schaltli/state/theme, as the broker keeps it",
      topic: "schaltli/state/theme",
      qos: "0",
      datatype: "utf8",
      broker: BROKER_ID,
      nl: false,
      rap: true,
      rh: 0,
      inputs: 0,
      x: 170,
      y: 340,
      wires: [["sbb-theme-seen"]],
    },
    {
      id: "sbb-fuel-in",
      type: "mqtt in",
      z,
      name: "schaltli/state/heater/fuel, as the broker keeps it",
      topic: "schaltli/state/heater/fuel",
      qos: "0",
      datatype: "utf8",
      broker: BROKER_ID,
      nl: false,
      rap: true,
      rh: 0,
      inputs: 0,
      x: 170,
      y: 400,
      wires: [["sbb-theme-seen"]],
    },
    {
      id: "sbb-fuel-since-in",
      type: "mqtt in",
      z,
      name: "schaltli/state/heater/fuel_since, as the broker keeps it",
      topic: "schaltli/state/heater/fuel_since",
      qos: "0",
      datatype: "utf8",
      broker: BROKER_ID,
      nl: false,
      rap: true,
      rh: 0,
      inputs: 0,
      x: 170,
      y: 440,
      wires: [["sbb-theme-seen"]],
    },
    {
      id: "sbb-theme-seen",
      type: "function",
      z,
      name: "remember what the broker keeps",
      func: `const logic = context.get("logic");
// The theme, and an Autoterm's fuel count, as they were before a restart.
flow.set("schaltliState", logic.seen(flow.get("schaltliState") || {}, msg.topic, msg.payload));
flow.set("schaltliFuel", logic.seenFuel(flow.get("schaltliFuel") || null, msg.topic, msg.payload));
return null;`,
      outputs: 0,
      timeout: 0,
      noerr: 0,
      initialize: LOGIC_INIT,
      finalize: "",
      libs: [],
      x: 390,
      y: 340,
      wires: [],
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
      name: "Schaltli bridge (local)",
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
    id: tabId,
    label: "Schaltli VanPi Bridge",
    info: "Installed and updated by the Schaltli designer's install script (scripts/install-vanpi-bridge.js).",
    nodes,
    configs,
  }
}

module.exports = { buildBridgeFlow, TAB_ID, BROKER_ID }
