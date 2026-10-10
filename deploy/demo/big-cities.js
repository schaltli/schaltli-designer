#!/usr/bin/env node
// The places of 50 000 people or more, from GeoNames' cities15000.zip, as
// lib/demo-geo.ts reads them (DEMO_BIG_CITIES): "cc<tab>name" a line, the
// name folded, each place under its name, its ASCII name and its other names
// in Latin letters. Run by deploy/demo/setup.sh:
//
//   node deploy/demo/big-cities.js cities15000.zip > big-cities.txt

const fs = require("fs")
const JSZip = require("jszip")

const MIN_PEOPLE = 50_000
// As lib/demo-geo.ts's foldName folds a name.
const fold = (name) => name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()
// Other names in Latin letters only: DB-IP's English "Zurich" is one of
// GeoNames' other names of "Zürich" (2026-10-10).
const LATIN = /^[\p{Script=Latin}\p{M} .'()-]+$/u

async function main() {
  const zip = await JSZip.loadAsync(fs.readFileSync(process.argv[2]))
  const text = await zip.file("cities15000.txt").async("string")
  const out = new Set()
  for (const line of text.split("\n")) {
    const f = line.split("\t")
    // GeoNames' columns: 1 name, 2 ASCII name, 3 other names, 8 country
    // code, 14 population.
    if (f.length < 15 || Number(f[14]) < MIN_PEOPLE) continue
    const names = [f[1], f[2], ...f[3].split(",").filter((n) => LATIN.test(n))]
    for (const name of names) if (name.trim()) out.add(`${f[8].toLowerCase()}\t${fold(name)}`)
  }
  process.stdout.write([...out].sort().join("\n") + "\n")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
