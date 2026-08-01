// A local MQTT broker for HIL testing (2026-08-01) - replaces the public
// test.mosquitto.org broker every HIL orchestrator used until now, after
// it started refusing new connections outright (ECONNRESET on every
// connect attempt, reproduced independently via a plain MQTT Explorer
// client too - a rate-limit/block on this network's public IP, not
// anything wrong with our own client code). Local-first, no cloud
// dependency for routine test runs - matches this project's own stated
// philosophy (see memory: project-local-first-no-cloud) - and removes an
// external service's availability from the critical path entirely.
//
// aedes (pure JS, already a devDependency) rather than a system Mosquitto
// install/Docker container - zero extra setup beyond `npm install`, and
// this project's HIL tooling is already all-Node.
//
// Run once, leave it running for the whole work session - same convention
// as the designer dev server (`npm run dev`): neither hil/epaper/
// orchestrator.js nor hil/android/orchestrator.js start this themselves,
// since they're just as often run standalone (iterating on one HIL case)
// as through npm run test:all, and a broker's lifetime shouldn't be tied
// to any single one of those invocations.
//
// Run: node hil/local-broker.js
// Then point orchestrators/devices at it - see hil/README.md.

const { Aedes } = require("aedes");
const net = require("net");
const os = require("os");

const PORT = Number(process.env.HIL_MQTT_PORT) || 1883;

function localLanAddresses() {
  const addrs = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === "IPv4" && !iface.internal) addrs.push(iface.address);
    }
  }
  return addrs;
}

async function main() {
  // Aedes.createBroker() (async factory), not `new Aedes()` - the latter
  // accepts TCP connections fine but leaves internal state (persistence/
  // mqemitter wiring) incomplete, so it never actually completes the MQTT
  // CONNECT/CONNACK handshake (silent "connack timeout"/ECONNRESET on every
  // client, 2026-08-01 finding - not obvious from the constructor alone,
  // only from aedes's own docs/Examples.md).
  const aedes = await Aedes.createBroker();
  const server = net.createServer(aedes.handle);

  aedes.on("clientError", (client, err) => {
    console.log("client error", client ? client.id : "unknown", err.message);
  });

  aedes.on("connectionError", (client, err) => {
    console.log("connection error", client ? client.id : "unknown", err.message);
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Local MQTT broker listening on 0.0.0.0:${PORT}`);
    console.log("Reachable at:");
    console.log(`  localhost:${PORT} (orchestrators on this machine)`);
    for (const addr of localLanAddresses()) {
      console.log(`  ${addr}:${PORT} (the e-paper device / Android phone, same LAN)`);
    }
    console.log("\nPoint the e-paper device at this broker once via its Setup page (WiFi & MQTT tab)");
    console.log("- see hil/README.md for the one-time reconfiguration steps.");
  });
}

main();
