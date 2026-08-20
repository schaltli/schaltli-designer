// Builds a project with many screens, each carrying a realistic-sized
// object count - purpose-built for orchestrator.js's --heap-scan mode
// (2026-08-17), NOT for visual comparison like build-comprehensive-test.js
// (no pixel-precision effort here, no assets/fonts needed at all: --heap-
// scan never renders a comparison image, it only reads back the `freeHeap`
// field TestInterfaceServer::handleScreenSwitch() now includes in its
// POST /api/screen response).
//
// Sizing: screenbee-m5dial's ProjectInstaller::splitProjectJsonIntoScreens()
// still has to fully deserialize this WHOLE file once at install time (see
// its own header comment) - build-comprehensive-test.js's header comment
// cites a ~31.7KB ESP.getMaxAllocHeap() ceiling, but that number was
// measured right after WiFi connect, before any real operation has run.
// Measured live 2026-08-17 (building the lazy-per-screen-loading refactor
// this fixture verifies) that the REAL ceiling once WiFi+MQTT+
// TestInterfaceServer have been running for a while - i.e. the actual
// moment a real upload/install happens - is meaningfully lower (observed
// ~17.4KB, presumably fragmentation-dependent, not a fixed number) - a
// first version of this fixture (8 screens x 10 objects, ~14.7KB raw JSON,
// needing a ~22KB buffer) failed "Not enough contiguous heap to split"
// every time as a result. 8 screens x 4 objects stays well under half the
// observed real ceiling for margin against run-to-run fragmentation
// variance, while still being "many screens with a real object count
// each," not the trivial 1-3-object fixtures used elsewhere in this repo's
// HIL suite.
//
// Run: node hil/m5dial/fixtures/build-heap-scan-test.js
// Produces: hil/m5dial/fixtures/heap-scan-test.zip
//
// Then: node hil/m5dial/orchestrator.js --project hil/m5dial/fixtures/heap-scan-test.zip --device <ip> --heap-scan

const path = require("path");
const fs = require("fs");
const JSZip = require("jszip");

const OUT_PATH = path.join(__dirname, "heap-scan-test.zip");
const SCREEN_COUNT = 8;
const OBJECTS_PER_SCREEN = 10;

function buildScreenObjects(screenIndex) {
  const objects = [];
  for (let i = 0; i < OBJECTS_PER_SCREEN; i++) {
    const x = 10 + (i % 4) * 55;
    const y = 10 + Math.floor(i / 4) * 55;
    if (i % 2 === 0) {
      objects.push({
        id: `s${screenIndex}-box${i}`,
        type: "box",
        x, y, width: 48, height: 48, zIndex: i,
        properties: {
          backgroundColor: "#336699",
          strokeColor: "#000000",
          strokeWidth: 1,
          cornerRadius: 4,
        },
      });
    } else {
      objects.push({
        id: `s${screenIndex}-label${i}`,
        type: "label",
        x, y, width: 48, height: 20, zIndex: i,
        properties: {
          text: `S${screenIndex}L${i}`,
          textColor: "#000000",
          textAlign: "center",
          fontSize: 12,
        },
      });
    }
  }
  return objects;
}

async function main() {
  const screens = [];
  for (let s = 0; s < SCREEN_COUNT; s++) {
    screens.push({
      id: `screen-${s}`,
      name: `Screen ${s}`,
      backgroundColor: "#ffffff",
      objects: buildScreenObjects(s),
    });
  }

  const project = {
    name: "M5 Dial HIL Heap Scan Test",
    // Matches the M5 Dial DDF's device.json - lets the firmware's own
    // DEVICE_ID compatibility check accept this fixture.
    deviceId: "m5stack-m5dial-v1-1",
    screenWidth: 240,
    screenHeight: 240,
    settings: { colorDepth: "24bit" },
    topics: [],
    assets: [],
    hardwareButtons: [],
    fonts: [],
    screens,
    exportedAt: new Date().toISOString(),
    version: "1.0.0",
  };

  const zip = new JSZip();
  zip.file("project.json", JSON.stringify(project));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(OUT_PATH, buf);
  console.log("Wrote", OUT_PATH, `(${SCREEN_COUNT} screens x ${OBJECTS_PER_SCREEN} objects)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
