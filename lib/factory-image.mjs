// The byte layout of a factory image, in one place, for the two sides that
// need it: the release tool in the firmware repo, which merges the four build
// artifacts into one file, and the flasher page, which checks what it is about
// to write onto someone's chip. See docs/2026-09-18-factory-image.md.
//
// Plain ES module, no dependencies and no Node APIs, so a browser can import
// it as it stands and the Pages workflow needs no bundler for it. Bytes are
// Uint8Array everywhere - a Buffer is one, so Node can pass its file contents
// straight in.

/**
 * Where each part of a flashed device lives. The offsets are the standard
 * ESP32-S3 layout every board here is built with (default_16MB.csv): the
 * second-stage bootloader at 0, the partition table at 0x8000, the OTA
 * selector at 0xe000, the app in its first slot at 0x10000.
 *
 * @type {ReadonlyArray<{ key: "bootloader" | "partitions" | "otaSelect" | "app", offset: number, file: string, label: string }>}
 */
export const FACTORY_PARTS = [
  { key: "bootloader", offset: 0x0, file: "bootloader.bin", label: "bootloader" },
  { key: "partitions", offset: 0x8000, file: "partitions.bin", label: "partition table" },
  { key: "otaSelect", offset: 0xe000, file: "boot_app0.bin", label: "OTA selector" },
  { key: "app", offset: 0x10000, file: "firmware.bin", label: "app" },
]

/** Where the app starts - the one offset OTA writes to, and the only part a release ships on its own. */
export const APP_OFFSET = 0x10000

/**
 * Where a person flashes a blank board: the Pages stand of this repo, built by
 * .github/workflows/flasher.yml. Named here because everything that points at
 * it imports this module anyway - the designer's firmware section and, from the
 * firmware repo, the release tool that writes it into every release note.
 */
export const FLASHER_URL = "https://matthias-hess.github.io/screenbee-designer/"

/** Erased flash reads as 0xff, so that is what the gaps between the parts are filled with. */
export const PAD_BYTE = 0xff

/** First byte of any ESP32 image: the magic the ROM bootloader looks for. */
export const ESP_IMAGE_MAGIC = 0xe9

/**
 * Every entry of a partition table starts with the magic 0x50aa, so the table
 * itself starts with it too - as the bytes 0xaa 0x50, little-endian.
 */
export const PARTITION_TABLE_MAGIC = [0xaa, 0x50]

/**
 * boot_app0.bin is an OTA selector holding ota_seq = 1, which selects the
 * first app slot - the slot the app is written to here. (The rest of its
 * 32-byte entry is 0xff with a checksum word at 0x1c; nothing here depends on
 * that, only on the sequence number.)
 */
export const OTA_SEQ_APP0 = [0x01, 0x00, 0x00, 0x00]

const MARKER_PREFIX = "<<screenbee-image device="
const MARKER_SUFFIX = ">>"

function ascii(text) {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff
  return out
}

function indexOfBytes(haystack, needle, from = 0) {
  outer: for (let i = from; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}

/**
 * Every device id marked in an image, each one once. The firmware compiles one
 * marker into itself (FirmwareImage.h) so an image can say which device it is
 * for; more than one, or the wrong one, means the wrong file.
 *
 * @param {Uint8Array} bytes
 * @returns {string[]}
 */
export function findDeviceMarkers(bytes) {
  const prefix = ascii(MARKER_PREFIX)
  const suffix = ascii(MARKER_SUFFIX)
  const found = []
  let at = 0
  for (;;) {
    const start = indexOfBytes(bytes, prefix, at)
    if (start === -1) return found
    const idStart = start + prefix.length
    const end = indexOfBytes(bytes, suffix, idStart)
    at = idStart
    if (end === -1 || end - idStart > 64) continue
    let id = ""
    for (let i = idStart; i < end; i += 1) id += String.fromCharCode(bytes[i])
    if (/^[a-z0-9-]+$/.test(id) && !found.includes(id)) found.push(id)
    at = end
  }
}

/**
 * The four parts, placed at their offsets, gaps padded - one file to write at
 * 0x0. Merging is nothing more than that, which is why no esptool is needed.
 *
 * @param {{ bootloader: Uint8Array, partitions: Uint8Array, otaSelect: Uint8Array, app: Uint8Array }} parts
 * @returns {Uint8Array}
 */
export function mergeFactoryImage(parts) {
  for (const part of FACTORY_PARTS) {
    const bytes = parts[part.key]
    if (!bytes || typeof bytes.length !== "number" || bytes.length === 0) {
      throw new Error(`factory image: the ${part.label} (${part.file}) is missing or empty`)
    }
  }
  // Each part has to fit in the room before the next one starts, or the layout
  // the partition table describes is not the layout of this file.
  for (let i = 0; i < FACTORY_PARTS.length - 1; i += 1) {
    const here = FACTORY_PARTS[i]
    const next = FACTORY_PARTS[i + 1]
    const room = next.offset - here.offset
    if (parts[here.key].length > room) {
      throw new Error(
        `factory image: the ${here.label} is ${parts[here.key].length} bytes, which does not fit in the ` +
          `${room} bytes before the ${next.label} at 0x${next.offset.toString(16)}`,
      )
    }
  }
  const last = FACTORY_PARTS[FACTORY_PARTS.length - 1]
  const image = new Uint8Array(last.offset + parts[last.key].length).fill(PAD_BYTE)
  for (const part of FACTORY_PARTS) image.set(parts[part.key], part.offset)
  return image
}

/**
 * What has to be true of a merged image. Returns the problems it found, so an
 * empty array means it is sound; both sides say what is wrong rather than
 * throwing on the first fault.
 *
 * `app` is optional: the release tool has the app image at hand and can have
 * the comparison made byte for byte, the flasher page has only the merged file
 * and checks what can be seen in it alone.
 *
 * @param {Uint8Array} image
 * @param {{ deviceId?: string, app?: Uint8Array }} [expected]
 * @returns {string[]}
 */
export function verifyFactoryImage(image, expected = {}) {
  const problems = []
  const at = (offset, bytes) => bytes.every((b, i) => image[offset + i] === b)

  if (image.length <= APP_OFFSET) {
    problems.push(`the image is ${image.length} bytes, which is not even past the app offset 0x${APP_OFFSET.toString(16)}`)
    return problems
  }
  if (image[0] !== ESP_IMAGE_MAGIC) {
    problems.push(`no bootloader at 0x0: the first byte is 0x${image[0].toString(16)}, not 0x${ESP_IMAGE_MAGIC.toString(16)}`)
  }
  if (!at(0x8000, PARTITION_TABLE_MAGIC)) {
    problems.push("no partition table at 0x8000: its magic 0x50aa is not there")
  }
  if (!at(0xe000, OTA_SEQ_APP0)) {
    problems.push("the OTA selector at 0xe000 does not select the first app slot")
  }
  if (image[APP_OFFSET] !== ESP_IMAGE_MAGIC) {
    problems.push(`no app at 0x${APP_OFFSET.toString(16)}: the first byte is 0x${image[APP_OFFSET].toString(16)}`)
  }
  // The byte before each part is the padding of the gap in front of it: if a
  // part were written at the wrong offset, or one ran into the next, this is
  // where it shows.
  for (const part of FACTORY_PARTS) {
    if (part.offset === 0) continue
    if (image[part.offset - 1] !== PAD_BYTE) {
      problems.push(`the gap before the ${part.label} at 0x${part.offset.toString(16)} is not padding`)
    }
  }

  const markers = findDeviceMarkers(image)
  if (expected.deviceId) {
    if (markers.length !== 1 || markers[0] !== expected.deviceId) {
      problems.push(`the image carries ${markers.length ? markers.join(", ") : "no device marker"}, expected ${expected.deviceId}`)
    }
  } else if (markers.length !== 1) {
    problems.push(`the image carries ${markers.length ? markers.join(", ") : "no device marker"}, expected exactly one`)
  }

  if (expected.app) {
    if (image.length !== APP_OFFSET + expected.app.length) {
      problems.push(`the image is ${image.length} bytes, expected ${APP_OFFSET + expected.app.length} for an app of ${expected.app.length}`)
    } else {
      for (let i = 0; i < expected.app.length; i += 1) {
        if (image[APP_OFFSET + i] !== expected.app[i]) {
          problems.push(`the app in the image differs from the OTA image, first at byte ${i}`)
          break
        }
      }
    }
  }
  return problems
}

/**
 * Which board someone has cannot be detected - but which chip is talking
 * certainly can, and every ScreenBee board is an ESP32-S3. An image built for
 * the S3 would not boot on anything else, so the one guess the hardware can
 * settle is settled before writing rather than after.
 *
 * Returns why this chip is refused, or null when it is fine. Used by the
 * flasher page after connecting and by hil/factory-flash/run.js before it
 * erases anything.
 *
 * @param {string} description what esptool reported, e.g. "ESP32-S3 (QFN56) (revision v0.2)"
 * @returns {string | null}
 */
export function refuseChip(description) {
  const text = String(description || "")
  if (!text.trim()) return "the chip did not say what it is"
  if (/esp32-?s3/i.test(text)) return null
  return `this is an ${text.split("(")[0].trim() || "unknown chip"}, and every ScreenBee board is an ESP32-S3` +
    " - the cable is probably in the wrong board"
}

/**
 * The hash the manifest names, computed the way a browser can - `crypto.subtle`
 * exists in a secure context, which the flasher page is.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
export async function sha256Hex(bytes) {
  const source = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : bytes.slice().buffer
  const digest = await crypto.subtle.digest("SHA-256", source)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
