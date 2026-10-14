// The test interface's password on every request HIL makes to a device
// (docs/device-contract.md §6, #70, 2026-10-14): a device's test interface
// is off from the factory and, switched on, refuses a request without
// `Authorization: Bearer <password>`.
//
// Loaded before every HIL script rather than written into each of them:
// test-all starts its steps with NODE_OPTIONS=--require <this file>, and a
// script run by hand gets it with
//
//   node -r ./hil/device-auth.js hil/<script>.js
//
// It wraps fetch() and every `curl` the scripts start, for any address that
// is not this machine's - the designer, the broker and the dev server stay
// as they were. The password is HIL_PASSWORD, from the environment or
// .env.local; hil/test-interface.js switches the bench's boards on with it.

const fs = require("fs")
const path = require("path")

function password() {
  if (process.env.HIL_PASSWORD) return process.env.HIL_PASSWORD
  try {
    const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    const line = env.split(/\r?\n/).find((l) => l.startsWith("HIL_PASSWORD="))
    return line ? line.slice("HIL_PASSWORD=".length).trim() : ""
  } catch {
    return ""
  }
}

const PASSWORD = password()
const LOCAL = /^(localhost|127\.|\[?::1\]?$|0\.0\.0\.0)/

function isDevice(url) {
  try {
    const { hostname, protocol } = new URL(String(url))
    return (protocol === "http:" || protocol === "https:") && !LOCAL.test(hostname)
  } catch {
    return false
  }
}

if (PASSWORD && typeof globalThis.fetch === "function" && !globalThis.fetch.__hilAuth) {
  const original = globalThis.fetch
  const wrapped = (input, init = {}) => {
    const url = typeof input === "string" || input instanceof URL ? input : input?.url
    if (!isDevice(url)) return original(input, init)
    const headers = new Headers(init.headers || (typeof input === "object" && !(input instanceof URL) ? input.headers : undefined))
    if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${PASSWORD}`)
    return original(input, { ...init, headers })
  }
  wrapped.__hilAuth = true
  globalThis.fetch = wrapped
}

if (PASSWORD) {
  const childProcess = require("child_process")
  const withAuth = (args) =>
    Array.isArray(args) && args.some(isDevice) ? ["-H", `Authorization: Bearer ${PASSWORD}`, ...args] : args
  for (const name of ["execFileSync", "execFile", "spawn", "spawnSync"]) {
    const original = childProcess[name]
    if (original.__hilAuth) continue
    const isCurl = (file) => /(^|[\\/])curl(\.exe)?$/i.test(String(file))
    const wrapped = function (file, args, ...rest) {
      if (isCurl(file)) args = withAuth(args)
      return original.call(this, file, args, ...rest)
    }
    // execFile's promisified form resolves with { stdout, stderr } through
    // a custom hook of its own; without it promisify(execFile) handed back
    // stdout alone, and every `const { stdout } = await` read undefined.
    const custom = original[require("util").promisify.custom]
    if (custom) {
      wrapped[require("util").promisify.custom] = (file, args, ...rest) => custom(file, isCurl(file) ? withAuth(args) : args, ...rest)
    }
    wrapped.__hilAuth = true
    childProcess[name] = wrapped
  }
}

// And node's own http module, which several scripts use for uploads and
// raw reads (firmware-common.js, the snapshot readers): request() and get()
// to a device get the header too.
if (PASSWORD) {
  const http = require("http")
  for (const name of ["request", "get"]) {
    const original = http[name]
    if (original.__hilAuth) continue
    const wrapped = function (...args) {
      let url = null
      let options = null
      if (typeof args[0] === "string" || args[0] instanceof URL) {
        url = String(args[0])
        if (args[1] && typeof args[1] === "object" && typeof args[1] !== "function") options = args[1]
        else {
          options = {}
          args.splice(1, 0, options)
        }
      } else if (args[0] && typeof args[0] === "object") {
        options = args[0]
        url = `http://${options.hostname || options.host || "localhost"}`
      }
      if (options && url && isDevice(url)) {
        options.headers = { ...(options.headers || {}) }
        const has = Object.keys(options.headers).some((k) => k.toLowerCase() === "authorization")
        if (!has) options.headers.Authorization = `Bearer ${PASSWORD}`
      }
      return original.apply(this, args)
    }
    wrapped.__hilAuth = true
    http[name] = wrapped
  }
}

module.exports = { HIL_PASSWORD: PASSWORD }
