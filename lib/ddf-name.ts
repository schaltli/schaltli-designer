/**
 * DDF identity: the hash of a DDF's bytes, and the two-word name a human
 * reads it by.
 *
 * A DDF has no version number (`ddfVersion` was deleted 2026-08-21). It
 * has an *identity*: the hash of the exact bytes served. That is not a
 * version because there is no ordering to it - only "same or not" - which
 * is the honest answer to the only question anyone ever asked a DDF
 * version: is the copy I hold the copy the device serves? `v1.9` could
 * never answer that; two builds could share it and differ, which is the
 * drift docs/nested-provenance.md exists to catch.
 *
 * Nobody sets this. It is computed from the bytes wherever they are held
 * and rendered at display time, so there is no field to forget to bump -
 * the failure mode that produced DDF 1.7 and 1.9 in the first place.
 */

import { sha256Hex } from "@/lib/sha256"

// 64 bits of the digest. Full sha256 hex is 64 characters, unwieldy in a
// log line, an MQTT `hello` and a filename; 64 bits is far more than enough
// to distinguish the handful of DDFs one installation ever sees, and this
// is an identity check rather than a defense against a crafted collision.
const HASH_LENGTH = 16

/**
 * The identity of a DDF: sha256 over the served bytes, truncated.
 *
 * Plain bytes, no canonicalization. Canonicalization was drafted and
 * rejected (see docs/version-model-simplification-plan.md): it would turn
 * this into a specification every producer must implement identically
 * across repos and languages, where "sha256 of this byte array" is a
 * standard function everywhere and cannot be read two ways. The cost is
 * that recompressing a content-identical DDF changes the hash - one
 * needless re-fetch of a small file, not a correctness bug.
 */
export function computeDdfHash(bytes: Uint8Array): string {
  return sha256Hex(bytes).slice(0, HASH_LENGTH)
}

// Frozen wordlists. Changing either one renames every DDF at once: not a
// correctness problem (the hash decides, never the name) but it invalidates
// every name a human has memorized or pasted into a log, so treat edits as
// a migration rather than a tidy-up.
//
// Split into adjective and noun rather than drawn from one pool because the
// two slots then cannot collide into "sage-sage", and an adjective-noun
// pair is what makes a name memorable enough to recognize on sight, which
// is the entire job. Both lists avoid homophones and near-spellings, since
// these get read aloud and typed into search boxes.
const ADJECTIVES = [
  "amber", "ancient", "arctic", "autumn", "azure", "balmy", "blazing", "blue",
  "bold", "boreal", "brave", "breezy", "brief", "bright", "brisk", "bronze",
  "calm", "candid", "cheery", "chilly", "civic", "clean", "clear", "clever",
  "cobalt", "cosmic", "cozy", "crimson", "crisp", "curious", "daring", "deep",
  "dense", "dewy", "downy", "dreamy", "dry", "dusky", "dusty", "eager",
  "early", "earthy", "easy", "elder", "elegant", "empty", "endless", "epic",
  "even", "faint", "fair", "famous", "fancy", "fertile", "fiery", "fine",
  "firm", "flaxen", "fleet", "floral", "fluffy", "fluid", "foamy", "fond",
  "formal", "frank", "free", "fresh", "frosty", "frozen", "gallant", "gentle",
  "giant", "gilded", "glad", "glassy", "gleaming", "glowing", "golden", "graceful",
  "grand", "grassy", "gray", "green", "hardy", "hazy", "hearty", "heavy",
  "hidden", "high", "honest", "humble", "husky", "icy", "idle", "indigo",
  "inland", "iron", "ivory", "jagged", "jolly", "joyful", "keen", "kind",
  "lanky", "large", "lasting", "late", "lavender", "lean", "level", "light",
  "lilac", "lively", "lofty", "lone", "long", "loud", "loyal", "lucid",
  "lucky", "lunar", "lush", "magenta", "main", "mellow", "merry", "mighty",
  "mild", "minty", "misty", "modest", "moonlit", "mossy", "mute", "narrow",
  "native", "neat", "nimble", "noble", "northern", "novel", "oaken", "olive",
  "open", "orange", "orderly", "ornate", "pale", "patient", "peaceful", "pearly",
  "peppery", "pink", "placid", "playful", "pleasant", "polar", "polished", "primal",
  "prime", "prompt", "proper", "proud", "pure", "purple", "quaint", "quick",
  "quiet", "radiant", "rapid", "rare", "ready", "real", "regal", "restful",
  "rich", "ripe", "rising", "robust", "rocky", "rosy", "rough", "round",
  "royal", "rugged", "rustic", "sable", "sacred", "safe", "saffron", "salty",
  "sandy", "scarlet", "seaside", "secret", "serene", "sharp", "sheer", "shiny",
  "short", "silent", "silken", "silver", "simple", "sincere", "sleek", "slender",
  "slight", "small", "smart", "smoky", "smooth", "snowy", "soft", "solar",
  "solid", "sound", "southern", "spare", "sparkling", "spicy", "spiral", "splendid",
  "square", "steady", "steep", "stellar", "stern", "still", "stony", "stormy",
  "straight", "strong", "sturdy", "sublime", "summer", "sunlit", "sunny", "supple",
  "swift", "tall", "tame", "tangy", "teal", "tender", "thankful", "thoughtful",
  "thriving", "tidal", "tidy", "timely", "tiny", "topaz", "tranquil", "true",
  "trusty", "twilight", "umber", "upbeat", "upland", "urban", "valiant", "vast",
  "verdant", "vibrant", "vivid", "warm", "watchful", "wavy", "waxen", "wide",
  "wild", "willing", "windy", "winter", "wise", "witty", "woodland", "woolly",
  "worthy", "young", "zesty",
]

const NOUNS = [
  "acorn", "alcove", "almond", "anchor", "anthem", "anvil", "apple", "arbor",
  "arch", "archer", "arrow", "ash", "aspen", "atlas", "aurora", "badger",
  "basin", "bay", "beacon", "beam", "bean", "bear", "beaver", "beech",
  "bell", "berry", "birch", "bison", "blossom", "bluff", "boat", "bolt",
  "bough", "boulder", "branch", "breeze", "bridge", "brook", "broom", "buffalo",
  "bugle", "bulb", "burrow", "cabin", "cactus", "camel", "canal", "candle",
  "canoe", "canyon", "cape", "caravan", "cardinal", "carrot", "cascade", "castle",
  "cavern", "cedar", "chalk", "chapel", "cherry", "chestnut", "chimney", "cinder",
  "cliff", "cloud", "clover", "coast", "cobble", "comet", "compass", "cone",
  "coral", "cottage", "cove", "crane", "crater", "creek", "crest", "cricket",
  "crown", "crystal", "cypress", "daisy", "dawn", "delta", "dew", "dial",
  "dock", "dome", "drift", "drum", "dune", "dusk", "eagle", "echo",
  "elm", "ember", "engine", "falcon", "fawn", "feather", "fern", "ferry",
  "fiddle", "field", "finch", "fjord", "flame", "flint", "flute", "forest",
  "forge", "fountain", "fox", "frost", "garden", "gate", "geyser", "glacier",
  "glade", "glen", "globe", "gorge", "granite", "grotto", "grove", "gull",
  "hamlet", "harbor", "harvest", "hawk", "hazel", "heather", "hedge", "heron",
  "hill", "hollow", "honey", "horizon", "hut", "iceberg", "inlet", "iris",
  "island", "ivy", "jade", "jasmine", "juniper", "kestrel", "kettle", "kite",
  "lagoon", "lake", "lantern", "larch", "lark", "laurel", "lava", "ledge",
  "lemon", "lighthouse", "lily", "linden", "lodge", "lotus", "lynx", "magnet",
  "mallard", "mango", "manor", "maple", "marble", "marsh", "meadow", "melon",
  "mesa", "meteor", "mill", "mint", "mirror", "mist", "moor", "moss",
  "mountain", "mulberry", "myrtle", "nectar", "needle", "nest", "nettle", "oak",
  "oasis", "oat", "ocean", "orchard", "orchid", "osprey", "otter", "owl",
  "oxbow", "palm", "panther", "pasture", "path", "peach", "peak", "pear",
  "pebble", "pelican", "pepper", "petal", "pier", "pigeon", "pillar", "pine",
  "pinnacle", "plain", "planet", "plateau", "plum", "pond", "poplar", "poppy",
  "port", "prairie", "puffin", "quarry", "quartz", "quill", "rabbit", "raft",
  "rain", "rapids", "raven", "reed", "reef", "ridge", "river", "robin",
  "rock", "rook", "root", "rose", "rowan", "ruby", "rudder", "saddle",
  "sage", "sail", "salmon", "sand", "sapling", "sapphire", "savanna", "sea",
  "seal", "sequoia", "shale", "shell", "shore", "shrub", "sierra", "silo",
  "sky", "slate", "sleigh", "sloop", "snow", "sparrow", "spire", "spring",
  "spruce", "spur", "squall", "stable", "star", "station", "steppe", "stone",
  "stork", "storm", "stream", "summit", "sun", "swallow", "swan", "sycamore",
  "tarn", "teak", "temple", "tern", "thicket", "thistle", "thorn", "thunder",
  "tide", "timber", "torch", "tower", "trail", "tulip", "tundra", "turtle",
  "valley", "vane", "vault", "velvet", "vine", "violet", "vista", "walnut",
  "warbler", "water", "wave", "weaver", "well", "wharf", "wheat", "willow",
  "window", "wing", "wolf", "wood", "wren", "yard", "yarrow", "yew",
  "zephyr",
]

// Exported for the spec, which checks the properties that would otherwise
// fail silently: a duplicate entry shrinks the space with no visible
// symptom, and an overlap between the two lists reintroduces "sage-sage".
export const DDF_NAME_WORDLISTS = { adjectives: ADJECTIVES, nouns: NOUNS }

/**
 * The human-readable rendering of a DDF hash, e.g. `amber-otter`.
 *
 * Display only. Never compare, key a cache, or name a file by this: two
 * words out of ~93,000 combinations collide far sooner than the hash does,
 * and a name collision would mean "the cache thinks it already has this
 * DDF" - serving a stale one, which is the exact bug class this whole model
 * exists to remove. Everything that decides anything uses the hash.
 *
 * Returns null for anything that is not a usable hash, so a project written
 * before this field existed shows no badge rather than crashing the editor
 * on a name it cannot render.
 */
export function ddfName(hash: string | null | undefined): string | null {
  if (typeof hash !== "string" || !/^[0-9a-f]{8,}$/.test(hash)) return null
  // 16 bits per slot, taken off the front. The modulo leaves a slight bias
  // toward the earliest words in each list (65536 divides by neither 283 nor
  // 329), which costs nothing here: uniformity would only matter if this
  // were a key, and it never is.
  const adjective = ADJECTIVES[parseInt(hash.slice(0, 4), 16) % ADJECTIVES.length]
  const noun = NOUNS[parseInt(hash.slice(4, 8), 16) % NOUNS.length]
  return `${adjective}-${noun}`
}
