// The boards a person can buy, as a person recognises them: the exact product
// name, something visible to tell it apart from the others, and what has to
// appear on its glass once it is flashed. The chip cannot be asked - all of them
// are ESP32-S3 with 16 MB - so this list is the only thing standing between a
// buyer and the wrong firmware (docs/2026-09-18-factory-image.md, decision 8).
//
// `id` is the device id the firmware announces and the release manifest files
// its images under. A release naming an id that is not here still shows up on
// the page, under its bare id, so a new board cannot go missing quietly.

export const BOARDS = [
  {
    id: "waveshare-knob-1v8",
    name: 'Waveshare ESP32-S3 Knob Touch LCD 1.8"',
    hint: "Round screen, 360 × 360, sitting in a ring you can turn.",
    expect: "a setup screen with a QR code, and a WiFi network of its own the QR code leads to",
    // Hard-won: the board has one USB-C socket, and whether the flasher can
    // connect depends on which way round the plug goes in.
    note: "This board has a single USB-C port. If it will not connect, unplug the cable, turn the plug over and plug it back in.",
  },
  {
    id: "waveshare-touch-lcd-4v3b",
    name: "Waveshare ESP32-S3 Touch LCD 4.3B",
    hint: "800 × 480 capacitive touch, screw terminals on the back for 7–36 V.",
    expect: "a setup screen with a QR code, and a WiFi network of its own the QR code leads to",
  },
  {
    id: "waveshare-touch-lcd-4",
    name: 'Waveshare ESP32-S3 Touch LCD 4"',
    hint: "Square screen, 480 × 480, screw terminals on the back for 7–36 V. «Rev 4.0» is printed on the back.",
    expect: "a setup screen with a QR code, and a WiFi network of its own the QR code leads to",
    // The V3 of the same name has another IO expander (a TCA9554) where the
    // panel's power and reset come from, and this firmware stops at boot on
    // it with a black screen (schaltli-firmware, waveshare4/BoardProfile.h).
    note: "Only the board revision with «Rev 4.0» on the back. An older V3 looks the same from the front but stays dark with this firmware.",
  },
  {
    id: "m5stack-papers3",
    name: "M5Stack PaperS3",
    hint: '4.7" e-paper, 960 × 540.',
    expect: "a setup screen with a QR code - e-paper takes a second or two to draw it, so give it that",
  },
]

/** @param {string} id */
export function boardFor(id) {
  return BOARDS.find((b) => b.id === id) || { id, name: id, hint: "", expect: "a setup screen" }
}
