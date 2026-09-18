import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

// Which designer this is. There is no version number to bump: the designer is
// installed by `git pull` (deploy/pekaway-install.sh), so its identity is its
// place in the history - and until 2026-09-18 nothing showed it, which meant
// "is my Pi up to date?" could only be answered over SSH.
//
// `git describe` and not a bare commit, because the release tag exists in THIS
// repository too: `gh release create` puts it here when the firmware release
// tool publishes (fw-2026.09.15.1 points at 55b3ad1 here, and at the firmware
// commit over there). So the designer describes itself in the same grammar the
// firmware uses - fw-2026.09.15.1-24-g457f1ad-dirty is "24 commits past that
// release" - and when both sit on a release, both simply read fw-2026.09.15.1.
// --always keeps it working before the first tag is fetched.
//
// Read here, at config time, so it covers `next dev` and `next build` alike and
// needs no generated file in the tree. A checkout without git (an unpacked
// tarball) simply has no stamp, and the line says "unknown" rather than
// pretending.
function designerStamp() {
  const cwd = fileURLToPath(new URL(".", import.meta.url))
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  try {
    return {
      build: git("describe", "--tags", "--always", "--dirty"),
      commit: git("rev-parse", "--short=7", "HEAD"),
      date: git("log", "-1", "--format=%cI"),
      dirty: git("status", "--porcelain").length > 0 ? "1" : "",
    }
  } catch {
    return { build: "", commit: "", date: "", dirty: "" }
  }
}

const stamp = designerStamp()

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_DESIGNER_BUILD: stamp.build,
    NEXT_PUBLIC_DESIGNER_COMMIT: stamp.commit,
    NEXT_PUBLIC_DESIGNER_DATE: stamp.date,
    NEXT_PUBLIC_DESIGNER_DIRTY: stamp.dirty,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Was `ignoreBuildErrors: true` until 2026-08-22, which meant the type
    // checker gated nothing: 28 errors had accumulated and the build passed
    // regardless. They are fixed and the count is zero, so the gate is
    // worth having - the point is not those 28 but the 29th, which would
    // otherwise arrive invisibly in the same noise.
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
