// The flasher page. What it does, in order: look up which factory images this
// Pages stand carries (images.json, written by scripts/build-flasher.js), let a
// person pick their board and a firmware, then check the image and write it at
// 0x0 over WebSerial. See docs/2026-09-18-factory-image.md.
//
// esptool-js is loaded only when someone actually presses the button: the page
// has to render, explain itself and be testable without it.

import { BOARDS, boardFor } from "./boards.mjs"
import { APP_OFFSET, refuseChip, sha256Hex, verifyFactoryImage } from "./factory-image.mjs"

const $ = (testid) => document.querySelector(`[data-testid="${testid}"]`)

const state = {
  /** @type {{ releases: Array<{ tag: string, published?: string, devices: Record<string, { file: string, size: number, sha256: string, systemGeneration?: string }> }> }} */
  catalogue: { releases: [] },
  boardId: "",
  tag: "",
}

function log(line) {
  const box = $("log")
  box.hidden = false
  box.textContent += line.endsWith("\n") ? line : `${line}\n`
  box.scrollTop = box.scrollHeight
}

function say(text, kind = "") {
  const status = $("status")
  status.textContent = text
  status.className = `status ${kind}`
}

const megabytes = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`

/** Every device id a release carries, boards first, then anything unrecognised. */
function cataloguedBoards() {
  const known = BOARDS.map((b) => b.id)
  const extra = []
  for (const release of state.catalogue.releases) {
    for (const id of Object.keys(release.devices || {})) {
      if (!known.includes(id) && !extra.includes(id)) extra.push(id)
    }
  }
  return [...BOARDS, ...extra.map((id) => boardFor(id))]
}

const releasesFor = (boardId) => state.catalogue.releases.filter((r) => r.devices && r.devices[boardId])

function entry() {
  const release = state.catalogue.releases.find((r) => r.tag === state.tag)
  if (!release || !release.devices[state.boardId]) return null
  return { ...release.devices[state.boardId], tag: release.tag, published: release.published, deviceId: state.boardId }
}

function renderBoards() {
  const host = $("boards")
  host.textContent = ""
  for (const board of cataloguedBoards()) {
    const available = releasesFor(board.id).length
    const button = document.createElement("button")
    button.className = "board"
    button.type = "button"
    button.dataset.testid = `board-${board.id}`
    button.setAttribute("aria-pressed", String(state.boardId === board.id))
    button.disabled = !available
    const name = document.createElement("div")
    name.className = "name"
    name.textContent = board.name
    const hint = document.createElement("div")
    hint.className = available ? "hint" : "missing"
    hint.textContent = available ? board.hint : "No factory image in the published releases yet."
    button.append(name, hint)
    button.addEventListener("click", () => {
      state.boardId = board.id
      const releases = releasesFor(board.id)
      state.tag = releases.length ? releases[0].tag : ""
      render()
    })
    host.append(button)
  }
}

function renderVersions() {
  const select = $("version-select")
  const releases = releasesFor(state.boardId)
  select.textContent = ""
  select.disabled = !releases.length
  if (!releases.length) {
    // An empty select reads as broken. Say what it is waiting for instead.
    const placeholder = document.createElement("option")
    placeholder.textContent = "— pick a board above —"
    select.append(placeholder)
  }
  for (const release of releases) {
    const option = document.createElement("option")
    option.value = release.tag
    const when = release.published ? release.published.slice(0, 10) : ""
    const generation = release.devices[state.boardId].systemGeneration
    option.textContent = [release.tag, when, generation ? `system ${generation}` : ""].filter(Boolean).join("  ·  ")
    option.selected = release.tag === state.tag
    select.append(option)
  }
  select.onchange = () => {
    state.tag = select.value
    render()
  }
}

function render() {
  renderBoards()
  renderVersions()
  const chosen = entry()
  const board = boardFor(state.boardId)
  $("image-meta").textContent = chosen
    ? `${chosen.file.split("/").pop()} - ${megabytes(chosen.size)}, written as one file at 0x0.`
    : "Pick your board above first."
  $("image-sha").textContent = chosen ? `SHA-256 ${chosen.sha256}` : ""
  $("board-note").hidden = !(chosen && board.note)
  if (chosen && board.note) $("board-note").textContent = board.note
  $("flash").disabled = !chosen || !("serial" in navigator)
}

/**
 * Fetch the image and refuse it unless it is the file the release names and a
 * sound factory image for the board that was picked. Both checks happen before
 * a single byte reaches the chip; a half-written flash is the one outcome worth
 * real trouble to avoid.
 *
 * Exported so the tests can drive it without a serial port.
 *
 * @param {{ file: string, size: number, sha256: string, deviceId: string }} chosen
 * @returns {Promise<Uint8Array>}
 */
export async function prepareImage(chosen) {
  const response = await fetch(chosen.file)
  if (!response.ok) throw new Error(`${chosen.file} could not be downloaded (${response.status})`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length !== chosen.size) {
    throw new Error(`the download is ${bytes.length} bytes, the release says ${chosen.size} - try again`)
  }
  const digest = await sha256Hex(bytes)
  if (digest !== chosen.sha256) {
    throw new Error(`the download does not match its SHA-256 (${digest}) - try again`)
  }
  const problems = verifyFactoryImage(bytes, { deviceId: chosen.deviceId })
  if (problems.length) throw new Error(`this is not a sound factory image: ${problems.join("; ")}`)
  return bytes
}

async function esptool() {
  try {
    return await import("./esptool.bundle.js")
  } catch (cause) {
    throw new Error("this page was published without its flashing code - please report it", { cause })
  }
}

async function flash() {
  const chosen = entry()
  if (!chosen) return
  const board = boardFor(state.boardId)
  const button = $("flash")
  const bar = $("progress")
  button.disabled = true
  $("log").textContent = ""
  let transport
  try {
    say(`Checking ${chosen.file.split("/").pop()}…`)
    const image = await prepareImage(chosen)
    log(`${chosen.file.split("/").pop()}: ${image.length} bytes, SHA-256 and layout as published`)

    const { ESPLoader, Transport } = await esptool()
    say("Waiting for you to pick the port…")
    const port = await navigator.serial.requestPort({})
    // No tracing: it dumps every packet to the browser console, which buries
    // the one thing a person needs to see if this goes wrong - what the loader
    // itself said, which lands in the log box below.
    transport = new Transport(port, false)
    const loader = new ESPLoader({
      transport,
      baudrate: 921600,
      terminal: { clean: () => {}, write: (text) => log(text.replace(/\r/g, "")), writeLine: (text) => log(text) },
    })

    say("Connecting…")
    const chip = await loader.main()
    log(`connected: ${chip}`)
    const wrongChip = refuseChip(chip)
    if (wrongChip) throw new Error(wrongChip)

    if ($("erase-all").checked) {
      say("Erasing the whole chip - this takes a moment…")
      await loader.eraseFlash()
      log("chip erased")
    }

    bar.hidden = false
    bar.value = 0
    say(`Writing ${board.name}…`)
    await loader.writeFlash({
      fileArray: [{ data: image, address: 0x0 }],
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (_index, written, total) => {
        bar.value = Math.round((written / total) * 100)
        say(`Writing ${board.name}… ${bar.value}%`)
      },
    })
    bar.value = 100

    say("Restarting the board…")
    await loader.after("hard_reset")

    const done = document.createElement("span")
    done.dataset.testid = "done"
    done.textContent = `Written. Now look at the device: it should show ${board.expect}. `
    const next = document.createElement("span")
    next.textContent = "If the screen stays dark or shows something else, you may have picked the wrong board - flashing the right one fixes it."
    const status = $("status")
    status.className = "status good"
    status.textContent = ""
    status.append(done, next)
  } catch (error) {
    // A person closing the port chooser is not a failure worth shouting about.
    const message = String(error && error.message ? error.message : error)
    if (/No port selected|cancell?ed/i.test(message)) say("No port picked - nothing was written.")
    else {
      say(`It did not work: ${message}`, "bad")
      log(message)
    }
  } finally {
    if (transport) {
      try {
        await transport.disconnect()
      } catch {
        /* the port may already be gone */
      }
    }
    bar.hidden = true
    button.disabled = false
    render()
  }
}

async function start() {
  if (!window.isSecureContext) $("insecure").hidden = false
  if (!("serial" in navigator)) $("unsupported").hidden = false

  try {
    const response = await fetch("./images.json", { cache: "no-store" })
    if (response.ok) state.catalogue = await response.json()
  } catch {
    /* handled below: no releases means the empty note */
  }
  const boards = cataloguedBoards().filter((b) => releasesFor(b.id).length)
  if (!boards.length) {
    $("empty").hidden = false
    return
  }
  // Deliberately nothing preselected. The chip cannot say which board it is
  // (decision 8), so the one thing this page must not do is offer a board
  // someone did not pick - a preselected first entry is a wrong flash waiting
  // for an impatient finger. The firmware version does get a default: there the
  // newest is the right answer.
  $("picker").hidden = false
  render()
  $("flash").addEventListener("click", flash)
}

// Skipped when the module is imported by a test rather than the page itself.
if (!window.__FLASHER_NO_AUTOSTART) start()

export { APP_OFFSET, state }
