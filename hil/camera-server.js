#!/usr/bin/env node
// A fake camera for the Camera object (docs/2026-11-09-camera.md): GET
// /shot.jpg gives the frame of a looping video that is due at this moment.
//
// By the clock, not "the next frame": a slow device must see a jerkier picture,
// not a slower film, or a delay could not be told from a low frame rate. That
// is what the spike got wrong by eye (2026-11-09, 1-10 s on an MJPEG stream).
//
// Every frame carries its number as a row of black and white blocks in the top
// left corner, so a test can read the glass (/panel.bmp), compare it with
// frameNow() and measure the delay instead of waving at a phone.
//
//   node hil/camera-server.js [--port 8090]
//
// For demo.schaltli.com the same video as people look at it: no number, a
// better picture, prepared on the PC and read from a folder on the server,
// which has neither the video nor ffmpeg (deploy/demo/):
//
//   node hil/camera-server.js --prepare-demo <dir>
//   node hil/camera-server.js --frames <dir> --host 127.0.0.1 --port 8090
//
// or from a test: const cam = await startCameraServer(); cam.mode({ slowMs: 500 })
//
// The video is the user's own footage and stays out of this public repository:
// SCHALTLI_CAMERA_VIDEO, or the file below in Downloads. Without one, ffmpeg's
// testsrc takes its place and the server says so. Its frames are smaller than a
// real picture, so frame rates measured against it are too good.

const { execFileSync } = require("child_process")
const crypto = require("crypto")
const fs = require("fs")
const http = require("http")
const os = require("os")
const path = require("path")
const { Jimp } = require("jimp")

const FPS = 30
const WIDTH = 320
const HEIGHT = 240
// About 8-12 KB a frame on the drain video, the size the spike called realistic
// (a detailed picture: quality 50 gave 18 KB).
const QUALITY = 20
// For eyes rather than for a measurement: about 18 KB a frame (demo.schaltli.com).
const DEMO_QUALITY = 50

// The frame number. Blocks of 16 px sit on JPEG's own 8x8/16x16 grid, so they
// survive compression; two sync blocks say a number is there at all, a parity
// block catches a misread.
const BLOCK = 16
const NUMBER_BITS = 12
const BLOCKS = 2 + NUMBER_BITS + 1
const OVERSIZE_BYTES = 300 * 1024
const CACHE_ROOT = path.join(__dirname, ".camera-frames")
const DEFAULT_VIDEO = path.join(os.homedir(), "Downloads", "PXL_20261011_090503124.mp4")

function bitsOf(n) {
  const bits = []
  for (let i = NUMBER_BITS - 1; i >= 0; i--) bits.push((n >> i) & 1)
  return bits
}

const parityOf = (bits) => bits.reduce((a, b) => a ^ b, 0)

function stampNumber(bitmap, n) {
  const bits = bitsOf(n)
  const pattern = [0, 1, ...bits, parityOf(bits)]
  pattern.forEach((bit, block) => {
    const level = bit ? 255 : 0
    for (let y = 0; y < BLOCK; y++) {
      for (let x = block * BLOCK; x < (block + 1) * BLOCK; x++) {
        const at = (y * bitmap.width + x) * 4
        bitmap.data[at] = bitmap.data[at + 1] = bitmap.data[at + 2] = level
      }
    }
  })
}

/**
 * Reads a frame number back. luma(x, y) gives 0-255 for a pixel; originX/Y is
 * where the picture's corner is, scale what the device decoded it at (1, 1/2...).
 * null when no number is there - a placeholder, a torn read.
 */
function readFrameNumber(luma, originX = 0, originY = 0, scale = 1) {
  const bits = []
  for (let block = 0; block < BLOCKS; block++) {
    const x = Math.round(originX + (block + 0.5) * BLOCK * scale)
    const y = Math.round(originY + 0.5 * BLOCK * scale)
    bits.push(luma(x, y) >= 128 ? 1 : 0)
  }
  if (bits[0] !== 0 || bits[1] !== 1) return null
  const number = bits.slice(2, 2 + NUMBER_BITS)
  if (parityOf(number) !== bits[BLOCKS - 1]) return null
  return number.reduce((a, b) => (a << 1) | b, 0)
}

function ffmpegAvailable() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function findVideo(explicit) {
  const candidate = explicit || process.env.SCHALTLI_CAMERA_VIDEO || DEFAULT_VIDEO
  return fs.existsSync(candidate) ? candidate : null
}

/**
 * The frames as JPEG buffers, prepared once and then read from a git-ignored
 * folder. `stamp: false` leaves out the number, `quality` sets the JPEG's.
 */
async function prepareFrames(videoPath, { stamp = true, quality = QUALITY } = {}) {
  const source = findVideo(videoPath)
  const stat = source ? fs.statSync(source) : null
  const key = crypto
    .createHash("sha1")
    .update(source ? `${path.basename(source)}:${stat.size}:${stat.mtimeMs}` : "testsrc")
    .update(`:${WIDTH}x${HEIGHT}:${FPS}:${quality}:${stamp ? BLOCK : "plain"}`)
    .digest("hex")
    .slice(0, 12)
  const dir = path.join(CACHE_ROOT, key)
  const done = path.join(dir, "done.json")

  if (!fs.existsSync(done)) {
    if (!ffmpegAvailable()) throw new Error("ffmpeg not found on PATH")
    fs.rmSync(dir, { recursive: true, force: true })
    const raw = path.join(dir, "raw")
    fs.mkdirSync(raw, { recursive: true })
    const fit = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT}`
    const input = source
      ? ["-i", source]
      : ["-f", "lavfi", "-i", `testsrc=size=${WIDTH}x${HEIGHT}:rate=${FPS}:duration=5`]
    execFileSync(
      "ffmpeg",
      ["-y", "-v", "error", ...input, "-an", "-r", String(FPS), "-vf", fit, path.join(raw, "%05d.png")],
      { stdio: "inherit" },
    )
    const names = fs.readdirSync(raw).filter((f) => f.endsWith(".png")).sort()
    if (names.length === 0 || names.length >= 1 << NUMBER_BITS) {
      throw new Error(`${names.length} frames from ${source ?? "testsrc"}: outside what a number can hold`)
    }
    for (let i = 0; i < names.length; i++) {
      const image = await Jimp.read(path.join(raw, names[i]))
      if (stamp) stampNumber(image.bitmap, i)
      fs.writeFileSync(path.join(dir, `${String(i).padStart(5, "0")}.jpg`), await image.getBuffer("image/jpeg", { quality }))
    }
    fs.rmSync(raw, { recursive: true, force: true })
    fs.writeFileSync(done, JSON.stringify({ frames: names.length, real: Boolean(source), stamp }))
  }
  return { ...readFrames(dir), dir }
}

/** Frames prepared before, from their folder: no video and no ffmpeg needed. */
function readFrames(dir) {
  const done = path.join(dir, "done.json")
  if (!fs.existsSync(done)) throw new Error(`${dir} holds no prepared frames (done.json missing)`)
  const meta = JSON.parse(fs.readFileSync(done, "utf8"))
  const frames = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort().map((f) => fs.readFileSync(path.join(dir, f)))
  if (frames.length !== meta.frames) throw new Error(`${dir} is incomplete: delete it and start again`)
  return { frames, real: meta.real }
}

const DEFAULT_MODE = {
  slowMs: 0, // wait this long before answering
  contentLength: true, // false: the image ends with the connection
  keepAlive: false, // true: allow the connection to be reused; IP Webcam does not
  basic: null, // { user, password }: required
  garbage: false, // bytes that are no JPEG
  oversize: false, // a JPEG beyond a device's 256 KB limit
}

async function startCameraServer({ port = 0, video, host = "0.0.0.0", framesDir, stamp, quality } = {}) {
  const { frames, real } = framesDir ? readFrames(framesDir) : await prepareFrames(video, { stamp, quality })
  const t0 = Date.now()
  let mode = { ...DEFAULT_MODE }
  let requests = 0
  // By who asked: another device on the bench still showing a camera project
  // asks too, and a test asks about its own (2026-11-10: the Knob, 13 a second).
  const byAddress = new Map()
  let listeningPort = port
  const sockets = new Set()

  const frameNow = () => Math.floor(((Date.now() - t0) * FPS) / 1000) % frames.length

  function bodyFor(frame) {
    if (mode.garbage) return crypto.randomBytes(9000)
    if (mode.oversize) return Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(OVERSIZE_BYTES, 0x55), Buffer.from([0xff, 0xd9])])
    return frames[frame]
  }

  function answer(res, frame) {
    const body = bodyFor(frame)
    res.setHeader("Content-Type", "image/jpeg")
    res.setHeader("X-Frame", String(frame))
    res.setHeader("Access-Control-Allow-Origin", "*") // or the designer's preview keeps its stand-in
    res.setHeader("Connection", mode.keepAlive && mode.contentLength ? "keep-alive" : "close")
    if (mode.contentLength) res.setHeader("Content-Length", String(body.length))
    else res.useChunkedEncodingByDefault = false // node would chunk it otherwise
    res.end(body)
  }

  function handler(req, res) {
    if (req.method !== "GET" || req.url.split("?")[0] !== "/shot.jpg") {
      res.statusCode = 404
      res.end()
      return
    }
    requests++
    const from = String(req.socket.remoteAddress || "").replace(/^::ffff:/, "")
    byAddress.set(from, (byAddress.get(from) || 0) + 1)
    if (mode.basic) {
      const expected = `Basic ${Buffer.from(`${mode.basic.user}:${mode.basic.password}`).toString("base64")}`
      if (req.headers.authorization !== expected) {
        res.statusCode = 401
        res.setHeader("WWW-Authenticate", 'Basic realm="camera"')
        res.setHeader("Connection", "close")
        res.end()
        return
      }
    }
    // The frame due when the answer leaves, as a camera that is slow to answer.
    if (mode.slowMs > 0) setTimeout(() => answer(res, frameNow()), mode.slowMs)
    else answer(res, frameNow())
  }

  let server = null
  function start() {
    return new Promise((resolve, reject) => {
      server = http.createServer(handler)
      server.on("connection", (socket) => {
        sockets.add(socket)
        socket.on("close", () => sockets.delete(socket))
      })
      server.once("error", reject)
      server.listen(listeningPort, host, () => {
        listeningPort = server.address().port
        resolve()
      })
    })
  }

  // Gone at once, open connections included: what a camera losing power does.
  function stop() {
    return new Promise((resolve) => {
      if (!server) return resolve()
      for (const socket of sockets) socket.destroy()
      server.close(() => {
        server = null
        resolve()
      })
    })
  }

  await start()
  return {
    get port() {
      return listeningPort
    },
    path: "/shot.jpg",
    frameCount: frames.length,
    real,
    meanBytes: Math.round(frames.reduce((sum, f) => sum + f.length, 0) / frames.length),
    frameNow,
    mode(patch) {
      mode = { ...DEFAULT_MODE, ...patch }
    },
    // All of them, or only those from one address.
    requests: (from) => (from ? byAddress.get(from) || 0 : requests),
    resetRequests() {
      requests = 0
      byAddress.clear()
    },
    start,
    stop,
  }
}

module.exports = { startCameraServer, prepareFrames, readFrames, readFrameNumber, ffmpegAvailable, findVideo, FPS, WIDTH, HEIGHT, BLOCK, DEMO_QUALITY }

const argAfter = (name) => {
  const at = process.argv.indexOf(name)
  return at > 0 ? process.argv[at + 1] : undefined
}

if (require.main === module && argAfter("--prepare-demo")) {
  // The demo's frames into a folder of their own, to be packed and uploaded.
  const out = path.resolve(argAfter("--prepare-demo"))
  prepareFrames(undefined, { stamp: false, quality: DEMO_QUALITY })
    .then(({ dir, frames, real }) => {
      if (!real) throw new Error("no video found (SCHALTLI_CAMERA_VIDEO): the demo gets no testsrc")
      fs.rmSync(out, { recursive: true, force: true })
      fs.cpSync(dir, out, { recursive: true })
      const kb = Math.round(frames.reduce((sum, f) => sum + f.length, 0) / frames.length / 1024)
      console.log(`${frames.length} frames, about ${kb} KB each, in ${out}`)
    })
    .catch((error) => {
      console.error(error.message)
      process.exit(1)
    })
} else if (require.main === module) {
  const port = argAfter("--port")
  startCameraServer({ port: port ? Number(port) : 8090, host: argAfter("--host"), framesDir: argAfter("--frames") })
    .then((cam) => {
      const addresses = Object.values(os.networkInterfaces()).flat().filter((a) => a.family === "IPv4" && !a.internal)
      console.log(`${cam.frameCount} frames, about ${Math.round(cam.meanBytes / 1024)} KB each`)
      if (!cam.real) console.warn("WARNING - no video found: testsrc frames, smaller than a real picture")
      const host = argAfter("--host")
      if (host && host !== "0.0.0.0") console.log(`http://${host}:${cam.port}${cam.path}`)
      else for (const a of addresses) console.log(`http://${a.address}:${cam.port}${cam.path}`)
    })
    .catch((error) => {
      console.error(error.message)
      process.exit(1)
    })
}
