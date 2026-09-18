// Which designer this is, for a person who has to answer "is my Pi up to
// date?" without opening an SSH session.
//
// There is no version number to bump here, and inventing one would be a second
// thing to keep in step by hand. A designer is installed and updated by
// `git pull` (deploy/pekaway-install.sh), so its identity is its place in the
// history - `git describe`, stamped in by next.config.mjs at build time.
//
// Designer and firmware are two repositories with two histories - the
// firmware's private, this one public - but they are not unrelated: the release
// tag lives in BOTH, because `gh release create` creates it here while the
// firmware release tool pushes it there. So both describe themselves the same
// way, off the same release name:
//
//   designer  fw-2026.09.15.1-24-g457f1ad-dirty    24 commits past that release
//   firmware  fw-2026.09.15.1-8-g330ff3bf2f-dirty   8 commits past it
//
// and when each sits exactly on a release, both read plain `fw-2026.09.15.1` -
// which is how "everything is in step" looks. The other number they share on
// purpose is the system generation (lib/system-generation.ts), which says
// whether they can work together at all. Three things, shown side by side
// rather than conflated: this designer, the generation it speaks, and the
// firmware release it carries.

export interface DesignerBuild {
  /**
   * `git describe --tags --always --dirty` of the checkout this was built from:
   * a release name with the distance past it, the same shape a firmware build
   * announces. "" when git was unavailable.
   */
  build: string
  /** Short commit of that checkout, "" when git was unavailable. */
  commit: string
  /** That commit's date, ISO 8601 with offset, "" when unknown. */
  date: string
  /** Built from a tree with uncommitted changes - nobody's release. */
  dirty: boolean
}

export const DESIGNER_BUILD: DesignerBuild = {
  build: process.env.NEXT_PUBLIC_DESIGNER_BUILD || "",
  commit: process.env.NEXT_PUBLIC_DESIGNER_COMMIT || "",
  date: process.env.NEXT_PUBLIC_DESIGNER_DATE || "",
  dirty: process.env.NEXT_PUBLIC_DESIGNER_DIRTY === "1",
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * The date of a build, as a person reads a date. Deliberately not `Intl`: the
 * same string should come out on a Pi, in a browser and in a test, whatever
 * locale they think they are in.
 */
export function formatBuildDate(iso: string): string {
  if (!iso) return ""
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return ""
  return `${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()}`
}

/**
 * One line naming this designer: what it describes itself as, and when that
 * commit was made. The `-dirty` suffix already says it was built from a tree
 * someone was still editing, so nothing repeats that in words. A checkout with
 * no git history says so instead of showing a blank.
 */
export function formatDesignerBuild(build: DesignerBuild = DESIGNER_BUILD): string {
  const name = build.build || build.commit
  if (!name) return "unknown checkout"
  return [name, formatBuildDate(build.date)].filter(Boolean).join(", ")
}
