#!/usr/bin/env node
// Proves the fake camera does what the device tests will rely on: every mode
// answers as hil/camera-server.js says, and a frame's number survives JPEG and
// scaling. Needs no device. Without ffmpeg (and with no prepared frames) it
// leaves with exit code 2, reported SKIPPED by test-all.

const fs = require("fs")
const net = require("net")
const os = require("os")
const path = require("path")
const { Jimp } = require("jimp")
const { startCameraServer, prepareFrames, readFrameNumber, ffmpegAvailable, FPS, WIDTH, HEIGHT, DEMO_QUALITY } = require("./camera-server")

let failures = 0
function check(name, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`)
  if (!ok) failures++
}

/** The whole answer as bytes, so framing node's fetch would hide can be seen. */
function rawGet(port, extraHeaders = "") {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.write(`GET /shot.jpg HTTP/1.1\r\nHost: x\r\n${extraHeaders}\r\n`)
    })
    const chunks = []
    socket.on("data", (d) => chunks.push(d))
    socket.on("close", () => {
      const all = Buffer.concat(chunks)
      const split = all.indexOf("\r\n\r\n")
      resolve({ head: all.subarray(0, split).toString().toLowerCase(), body: all.subarray(split + 4) })
    })
    socket.on("error", reject)
  })
}

const url = (cam) => `http://127.0.0.1:${cam.port}${cam.path}`
const shot = async (cam, init) => {
  const res = await fetch(url(cam), init)
  return { res, body: Buffer.from(await res.arrayBuffer()) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function numberIn(buffer, scale = 1) {
  const image = await Jimp.read(buffer)
  if (scale !== 1) image.resize({ w: Math.round(WIDTH * scale), h: Math.round(HEIGHT * scale) })
  const { data, width } = image.bitmap
  const luma = (x, y) => {
    const at = (y * width + x) * 4
    return (data[at] * 77 + data[at + 1] * 150 + data[at + 2] * 29) >> 8
  }
  return readFrameNumber(luma, 0, 0, scale)
}

async function main() {
  let cam
  try {
    cam = await startCameraServer({ host: "127.0.0.1" })
  } catch (error) {
    if (!ffmpegAvailable()) {
      console.warn(`SKIPPED - ${error.message}`)
      process.exit(2)
    }
    throw error
  }
  console.log(`${cam.frameCount} frames, mean ${cam.meanBytes} bytes, ${cam.real ? "the video" : "testsrc"}`)
  if (!cam.real) console.warn("WARNING - no video found: testsrc frames, sizes are not realistic")

  // A plain frame, and its number at every scale a device decodes at.
  const plain = await shot(cam)
  const sent = Number(plain.res.headers.get("x-frame"))
  check("a frame is a JPEG", plain.body[0] === 0xff && plain.body[1] === 0xd8)
  check("Content-Length is the body", Number(plain.res.headers.get("content-length")) === plain.body.length)
  check("the server closes, as IP Webcam does", plain.res.headers.get("connection") === "close")
  check("the first answer carries a frame number", Number.isInteger(sent))
  // Frames spread over the film: frame 0 alone is all zeros and proves little.
  let read = 0
  let readHalf = 0
  const samples = 12
  const seen = new Set()
  for (let i = 0; i < samples; i++) {
    const { res, body } = await shot(cam)
    const number = Number(res.headers.get("x-frame"))
    seen.add(number)
    if ((await numberIn(body)) === number) read++
    if ((await numberIn(body, 0.5)) === number) readHalf++
    await sleep(83)
  }
  check("frames sampled differ", seen.size >= samples / 2, `${seen.size} different`)
  check("number survives JPEG", read === samples, `${read}/${samples}`)
  check("number survives scaling to 1/2", readHalf === samples, `${readHalf}/${samples}`)
  if (cam.real) {
    check("frames are a realistic size", cam.meanBytes >= 6 * 1024 && cam.meanBytes <= 12 * 1024, `${cam.meanBytes} bytes`)
  }

  // By the clock.
  const before = cam.frameNow()
  await sleep(500)
  const advanced = (cam.frameNow() - before + cam.frameCount) % cam.frameCount
  check("the film runs by the clock", Math.abs(advanced - FPS / 2) <= 3, `${advanced} frames in 500 ms`)

  // Requests are counted, so a test can prove there are none.
  cam.resetRequests()
  await shot(cam)
  await shot(cam)
  check("requests are counted", cam.requests() === 2)
  check("and by who asked", cam.requests("127.0.0.1") === 2 && cam.requests("192.0.2.1") === 0, `${cam.requests("127.0.0.1")} from here`)

  // slow: the frame is the one due when the answer leaves.
  cam.mode({ slowMs: 300 })
  const t0 = Date.now()
  const slow = await shot(cam)
  const took = Date.now() - t0
  check("slow answers late", took >= 290, `${took} ms`)
  const age = (cam.frameNow() - Number(slow.res.headers.get("x-frame")) + cam.frameCount) % cam.frameCount
  check("slow still gives a current frame", age <= 3, `${age} frames old`)

  // Without Content-Length: the bytes alone, ended by the connection.
  cam.mode({ contentLength: false })
  const bare = await rawGet(cam.port)
  check("no Content-Length", !bare.head.includes("content-length"))
  check("not chunked either", !bare.head.includes("transfer-encoding") && bare.body[0] === 0xff && bare.body[1] === 0xd8)
  check("ends in a JPEG's end", bare.body[bare.body.length - 2] === 0xff && bare.body[bare.body.length - 1] === 0xd9)

  // keepAlive: the same connection answers twice.
  cam.mode({ keepAlive: true })
  check("keep-alive is offered", (await shot(cam)).res.headers.get("connection") === "keep-alive")

  // Basic.
  cam.mode({ basic: { user: "cam", password: "s3cret" } })
  check("no credentials: 401", (await shot(cam)).res.status === 401)
  const header = `Basic ${Buffer.from("cam:wrong").toString("base64")}`
  check("wrong password: 401", (await shot(cam, { headers: { Authorization: header } })).res.status === 401)
  const good = `Basic ${Buffer.from("cam:s3cret").toString("base64")}`
  check("right password: an image", (await shot(cam, { headers: { Authorization: good } })).res.status === 200)

  // What a device must survive.
  cam.mode({ garbage: true })
  const garbage = await shot(cam)
  check("garbage is no JPEG", garbage.res.status === 200 && !(garbage.body[0] === 0xff && garbage.body[1] === 0xd8))
  cam.mode({ oversize: true })
  check("oversize is beyond 256 KB", (await shot(cam)).body.length > 256 * 1024)

  // Gone, and back on the same port.
  cam.mode({})
  const port = cam.port
  await cam.stop()
  let refused = false
  try {
    await shot(cam)
  } catch {
    refused = true
  }
  check("stopped: nothing answers", refused)
  await cam.start()
  check("restarted on the same port", cam.port === port && (await shot(cam)).res.status === 200)

  await cam.stop()

  // The demo's camera (demo.schaltli.com): no number, a better picture, and
  // served from a folder of prepared frames, as on a server without ffmpeg.
  const { dir } = await prepareFrames(undefined, { stamp: false, quality: DEMO_QUALITY })
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "camera-frames-"))
  fs.cpSync(dir, copy, { recursive: true })
  const demo = await startCameraServer({ host: "127.0.0.1", framesDir: copy })
  try {
    check("from a folder of prepared frames", demo.frameCount === cam.frameCount, `${demo.frameCount} frames`)
    // Its own number, that is: a picture's corner may read as some number by
    // chance, never as the frame's.
    let numbered = 0
    for (let i = 0; i < 6; i++) {
      const { res, body } = await shot(demo)
      if ((await numberIn(body)) === Number(res.headers.get("x-frame"))) numbered++
      await sleep(83)
    }
    check("the demo's frames carry no number", numbered === 0, `${numbered} of 6 carry theirs`)
    check("and a better picture than the tests'", demo.meanBytes > cam.meanBytes, `${demo.meanBytes} against ${cam.meanBytes} bytes`)
    check("a browser on another address may draw it", (await shot(demo)).res.headers.get("access-control-allow-origin") === "*")
  } finally {
    await demo.stop()
    fs.rmSync(copy, { recursive: true, force: true })
  }

  if (failures) {
    console.log(`\nFAIL - ${failures} check(s) failed`)
    process.exit(1)
  }
  console.log("\nPASS - the fake camera does what the device tests rely on")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
