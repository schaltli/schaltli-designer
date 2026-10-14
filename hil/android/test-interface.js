// Switches the app's test interface on or off over the cable - the phone's
// counterpart to hil/test-interface.js for the boards' USB (contract §6,
// #70). Like that one it needs the device in someone's hands; the app's
// settings offer the same switch.
//
//   node hil/android/test-interface.js on    with HIL_PASSWORD (hil/device-auth.js)
//   node hil/android/test-interface.js off
//
// Through the receiver the broker is set with (BrokerConfigReceiver), which
// answers with what it did. A stopped app is not handed broadcasts, so the
// app is started first and asked until it answers.

const path = require("path")
const { execFile } = require("child_process")
const { promisify } = require("util")
const execFileAsync = promisify(execFile)

const ADB = process.env.ANDROID_ADB_PATH || path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "platform-tools", "adb.exe")
const APP_ACTIVITY = "com.schaltli.android/.MainActivity"

async function main() {
  const what = process.argv[2]
  if (!["on", "off"].includes(what)) {
    console.log("usage: node hil/android/test-interface.js on|off")
    process.exit(1)
  }
  const { HIL_PASSWORD } = require("../device-auth")
  if (what === "on" && !HIL_PASSWORD) {
    console.log("FAIL no HIL_PASSWORD - run node hil/test-interface.js on once, which writes one into .env.local")
    process.exit(1)
  }
  const serial = process.env.ANDROID_SERIAL ? ["-s", process.env.ANDROID_SERIAL] : []
  await execFileAsync(ADB, [...serial, "shell", "am", "start", "-n", APP_ACTIVITY])
  const args = [...serial, "shell", "am", "broadcast", "-n", "com.schaltli.android/.data.BrokerConfigReceiver",
    "-a", "com.schaltli.android.SET_BROKER", "--ez", "testInterface", what === "on" ? "true" : "false",
    ...(what === "on" ? ["--es", "testPassword", HIL_PASSWORD] : [])]
  for (let tries = 0; tries < 10; tries++) {
    const { stdout } = await execFileAsync(ADB, args)
    const said = /data="([^"]*)"/.exec(stdout)?.[1]
    if (said) {
      console.log(`${said.startsWith("refused") ? "FAIL" : "ok  "} ${said}`)
      process.exit(said.startsWith("refused") ? 1 : 0)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  console.log("FAIL the app did not answer - is it older than 0.13.0?")
  process.exit(1)
}

main().catch((err) => {
  console.log(`FAIL ${err.message}`)
  process.exit(1)
})
