// What keeps two boards apart when their suites run at the same time
// (hil/test-all.js runs a lane per device): the --device argument as a word,
// for a topic prefix, a temp file and a report folder. A suite on the knob
// and the same suite on the 4.3B then neither hear each other's values nor
// overwrite each other's zip or pictures.
function deviceTag(argv = process.argv) {
  const i = argv.indexOf("--device")
  const device = i > 0 ? argv[i + 1] : ""
  return (device || "no-device").replace(/[^0-9a-z]+/gi, "-")
}

module.exports = { deviceTag }
