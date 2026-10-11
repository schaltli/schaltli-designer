// Text onto the system's clipboard from a click or a key (2026-10-11), on any
// page: navigator.clipboard is there only on https and localhost, and a
// designer on a van is reached over plain http (http://<pekaway>:3000). The
// copy event's own clipboardData works on both, as long as the copy happens
// in answer to the user.

/** Puts `text` on the clipboard; false where the browser would not. */
export function copyText(text: string): boolean {
  let done = false
  const onCopy = (event: ClipboardEvent) => {
    event.clipboardData?.setData("text/plain", text)
    event.preventDefault()
    done = true
  }
  document.addEventListener("copy", onCopy)
  try {
    document.execCommand("copy")
  } catch {
    // Refused: tried below.
  } finally {
    document.removeEventListener("copy", onCopy)
  }
  if (!done && typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(text).catch(() => {})
    return true
  }
  return done
}
