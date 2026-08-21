import { test, expect } from "@playwright/test"
import { createHash, randomBytes } from "node:crypto"
import { computeDdfHash, ddfName, DDF_NAME_WORDLISTS } from "../lib/ddf-name"
import { sha256Hex } from "../lib/sha256"

// Pure functions, so this runs entirely in the test process - no page, no
// server. It lives under e2e/ only because Playwright is this repo's only
// test runner; nothing here touches a browser.
//
// The reason it exists at all: lib/sha256.ts is a hand-written
// implementation (crypto.subtle is unavailable in the insecure LAN context
// this app is meant to run in - see that file's header), and a subtly wrong
// hash would not throw anywhere. It would quietly produce values that
// disagree with what every other language computes, and the symptom would
// surface as "the device says it serves a DDF the designer never
// recognizes" - in a firmware repo, weeks later.

test.describe("DDF identity", () => {
  test("sha256 matches the standard vectors and Node's own implementation", () => {
    const utf8 = (s: string) => new TextEncoder().encode(s)

    // FIPS 180-4's published vectors: independent of any implementation on
    // this machine, so a shared misunderstanding can't make this pass.
    expect(sha256Hex(utf8(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    expect(sha256Hex(utf8("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    expect(sha256Hex(utf8("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    )

    // Every length from 0 to 200 bytes, which is what actually covers the
    // padding arithmetic: the one-block/two-block boundary sits at 55/56
    // bytes and again at 119/120, and those are precisely the cases a
    // hand-written implementation gets wrong while passing "abc".
    for (let length = 0; length <= 200; length++) {
      const bytes = randomBytes(length)
      expect(sha256Hex(new Uint8Array(bytes)), `length ${length}`).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      )
    }
  })

  test("the same bytes hash the same, different bytes don't", () => {
    const bytes = randomBytes(512)
    expect(computeDdfHash(new Uint8Array(bytes))).toBe(computeDdfHash(new Uint8Array(bytes)))
    expect(computeDdfHash(new Uint8Array(bytes))).toMatch(/^[0-9a-f]{16}$/)

    // One flipped bit in the middle of a DDF-sized payload - the realistic
    // "someone rebuilt it with a one-character change" case, not a wholesale
    // difference that any checksum would catch.
    const flipped = Buffer.from(bytes)
    flipped[256] ^= 0x01
    expect(computeDdfHash(new Uint8Array(flipped))).not.toBe(computeDdfHash(new Uint8Array(bytes)))
  })

  test("the name is a pure rendering of the hash", () => {
    const hash = computeDdfHash(new Uint8Array(randomBytes(64)))
    expect(ddfName(hash)).toBe(ddfName(hash))
    expect(ddfName(hash)).toMatch(/^[a-z]+-[a-z]+$/)
    // Only the hash decides the name - nothing about the bytes it came from
    // leaks in, which is what lets a firmware log a hash and a human match
    // it to a badge.
    expect(ddfName("0011223344556677")).toBe(ddfName("0011223344556677"))
  })

  test("an unusable hash renders no name rather than throwing", () => {
    // A project written before this field existed reaches the badge with
    // undefined. Throwing there would take out the editor over a decoration.
    for (const bad of [null, undefined, "", "nope", "abc", "GGGG0000", 42 as unknown as string]) {
      expect(ddfName(bad as string | null | undefined)).toBeNull()
    }
  })

  test("the wordlists keep the properties the name space depends on", () => {
    const { adjectives, nouns } = DDF_NAME_WORDLISTS

    // A duplicate would shrink the space with no visible symptom at all -
    // the names would still look fine, two different DDFs would just collide
    // more often than anyone thought.
    expect(new Set(adjectives).size, "duplicate adjective").toBe(adjectives.length)
    expect(new Set(nouns).size, "duplicate noun").toBe(nouns.length)
    // Disjoint, so no DDF is ever called "sage-sage".
    expect(adjectives.filter((word) => nouns.includes(word))).toEqual([])
    // Not a precise count (the lists are allowed to grow), but a floor: below
    // this the pairs stop being distinguishing enough to be worth showing.
    expect(adjectives.length).toBeGreaterThanOrEqual(256)
    expect(nouns.length).toBeGreaterThanOrEqual(256)
    for (const word of [...adjectives, ...nouns]) {
      // Lowercase ASCII only - these end up in filenames, log lines and
      // search boxes.
      expect(word, `"${word}" is not plain lowercase ASCII`).toMatch(/^[a-z]+$/)
    }
  })

  test("every word in both lists is reachable", () => {
    // The indexing takes 16 bits per slot and takes them modulo the list
    // length. A slot narrower than the list would silently make the tail of
    // that list dead - names no DDF could ever get - which is invisible
    // without checking.
    const { adjectives, nouns } = DDF_NAME_WORDLISTS
    const seenAdjectives = new Set<string>()
    const seenNouns = new Set<string>()
    for (let i = 0; i < 0x10000; i++) {
      const hex = i.toString(16).padStart(4, "0")
      seenAdjectives.add(ddfName(`${hex}0000`)!.split("-")[0])
      seenNouns.add(ddfName(`0000${hex}`)!.split("-")[1])
    }
    expect(seenAdjectives.size).toBe(adjectives.length)
    expect(seenNouns.size).toBe(nouns.length)
  })
})
