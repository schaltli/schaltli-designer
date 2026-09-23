// Parts to build a factory image out of in a test, and the real bytes they
// start with.
//
// The heads are the first 32 bytes of a real build (the 4.3B's bootloader, its
// partition table, the Arduino core's boot_app0.bin, its app), pasted in as
// they are. That is the point of them: a fixture written from the constants in
// lib/factory-image.mjs would agree with a mistake there, and one such mistake
// really happened - a partition magic of 0xaa50 for 0x50aa, caught on
// 2026-09-18 only by merging a real build.

export const REAL_HEADS = {
  bootloader: "e904024fac883c40ee0000000900000000ffff00000000012028ce3f88110000",
  partitions: "aa50010200900000005000006e76730000000000000000000000000000000000",
  otaSelect: "01000000ffffffffffffffffffffffffffffffffffffffffffffffff9a984347",
  app: "e905024fd4693740ee0000000900000000ffff00000000012000113c5c1a0a00",
}

export const FIXTURE_DEVICE = "waveshare-touch-lcd-4v3b"

export function head(hex: string, length: number, fillWith = 0x00): Uint8Array {
  const bytes = new Uint8Array(length).fill(fillWith)
  for (let i = 0; i < hex.length / 2 && i < length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function asciiInto(bytes: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i)
}

/** An app of a plausible shape: a real header and one marker, where the compiler would leave it. */
export function appImage(deviceId: string = FIXTURE_DEVICE, size = 64 * 1024): Uint8Array {
  const app = head(REAL_HEADS.app, size)
  asciiInto(app, Math.floor(size / 2), `<<schaltli-image device=${deviceId}>>`)
  return app
}

/** The four parts a factory image is made of, named the way the merge expects them. */
export type FactoryPartsShape = {
  bootloader: Uint8Array
  partitions: Uint8Array
  otaSelect: Uint8Array
  app: Uint8Array
}

export function factoryParts(overrides: Partial<FactoryPartsShape> = {}): FactoryPartsShape {
  return {
    bootloader: head(REAL_HEADS.bootloader, 20160),
    partitions: head(REAL_HEADS.partitions, 3072),
    otaSelect: head(REAL_HEADS.otaSelect, 8192, 0xff),
    app: appImage(),
    ...overrides,
  }
}
