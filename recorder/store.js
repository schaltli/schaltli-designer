// The recorder's file (tasks/charts-recorder-plan.md decision 8): one JSON
// file, written whole to a temporary file and renamed over the old one, so
// a write cut short by a power cut leaves the last good one in place.

"use strict"

const fs = require("fs")
const path = require("path")

function read(file, log) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (err) {
    if (err.code !== "ENOENT") log(`${file} could not be read (${err.message}) - starting without history`)
    return null
  }
}

function write(file, data, log) {
  const tmp = `${file}.tmp`
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify(data))
    fs.renameSync(tmp, file)
  } catch (err) {
    log(`${file} could not be written (${err.message})`)
  }
}

module.exports = { read, write }
