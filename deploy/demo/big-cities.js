#!/usr/bin/env node
// The places of 50 000 people or more, from GeoNames' cities15000.zip, as
// lib/demo-geo.ts reads them (DEMO_BIG_CITIES): "CC<tab>name" a line, each
// place under its name and its ASCII name. Run by deploy/demo/setup.sh:
//
//   node deploy/demo/big-cities.js cities15000.zip > big-cities.txt

const fs = require("fs")
const JSZip = require("jszip")

const MIN_PEOPLE = 50_000

async function main() {
  const zip = await JSZip.loadAsync(fs.readFileSync(process.argv[2]))
  const text = await zip.file("cities15000.txt").async("string")
  const out = new Set()
  for (const line of text.split("\n")) {
    const f = line.split("\t")
    // GeoNames' columns: 1 name, 2 ASCII name, 8 country code, 14 population.
    if (f.length < 15 || Number(f[14]) < MIN_PEOPLE) continue
    for (const name of [f[1], f[2]]) if (name) out.add(`${f[8]}\t${name}`)
  }
  process.stdout.write([...out].sort().join("\n") + "\n")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
