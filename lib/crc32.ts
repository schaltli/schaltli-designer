/**
 * Standard CRC-32 (IEEE 802.3 / zlib polynomial 0xEDB88320) - the exact
 * same algorithm the firmware's bundled `miniz` library exposes as
 * `mz_crc32()` (see miniz.h under .pio/libdeps in the firmware repo). Used
 * by the MQTT deploy flow (components/deploy-dialog.tsx) to let a device
 * verify a downloaded project zip arrived intact before it touches its
 * live project - see DeployManager on the firmware side. Deliberately
 * CRC32, not a cryptographic hash: this checks transfer correctness only,
 * not tamper-resistance (the MVP's accepted trust model is the LAN
 * itself, not the message content).
 */

let crcTable: Uint32Array | null = null

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  crcTable = table
  return table
}

export function crc32(data: Uint8Array): number {
  const table = getCrcTable()
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
