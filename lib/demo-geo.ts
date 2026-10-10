import fs from "fs"
import { Reader, type CityResponse } from "mmdb-lib"

// Where a demo visitor is, roughly (docs/2026-10-10-demo-tracking.md): looked
// up once per visit from the address the request came from, in a database on
// the server itself - DB-IP's free city database (DEMO_GEO_DB, an .mmdb,
// "IP Geolocation by DB-IP", CC BY 4.0) - and kept as country and region,
// with the city only where it is large enough that a visit there points at
// no one (DEMO_BIG_CITIES: GeoNames' places of 50 000 people or more, one
// "CC<tab>name" a line). The address itself is never kept.
//
// Without either file - in development, in the tests - there is no place.

export interface DemoPlace {
  country: string
  region?: string
  city?: string
}

interface GeoRecord {
  country?: { iso_code?: string }
  subdivisions?: { names?: { en?: string } }[]
  city?: { names?: { en?: string } }
}

/** The place from a looked-up record: the city only if it is a big one. */
export function placeOf(record: GeoRecord | null, bigCities: Set<string>): DemoPlace | null {
  const country = record?.country?.iso_code
  if (!country) return null
  const place: DemoPlace = { country }
  const region = record?.subdivisions?.[0]?.names?.en
  if (region) place.region = region
  const city = record?.city?.names?.en
  if (city && bigCities.has(`${country}\t${city}`.toLowerCase())) place.city = city
  return place
}

let loaded: { reader: Reader<CityResponse> | null; bigCities: Set<string> } | null = null

function load() {
  if (loaded) return loaded
  let reader: Reader<CityResponse> | null = null
  let bigCities = new Set<string>()
  try {
    if (process.env.DEMO_GEO_DB) reader = new Reader<CityResponse>(fs.readFileSync(process.env.DEMO_GEO_DB))
  } catch {
    reader = null
  }
  try {
    if (process.env.DEMO_BIG_CITIES) {
      bigCities = new Set(
        fs
          .readFileSync(process.env.DEMO_BIG_CITIES, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => line.toLowerCase()),
      )
    }
  } catch {
    bigCities = new Set()
  }
  loaded = { reader, bigCities }
  return loaded
}

/** The visitor's place, or null where there is no database or no answer. */
export function lookUpPlace(address: string | null): DemoPlace | null {
  if (!address) return null
  const { reader, bigCities } = load()
  if (!reader) return null
  try {
    return placeOf(reader.get(address), bigCities)
  } catch {
    return null
  }
}
