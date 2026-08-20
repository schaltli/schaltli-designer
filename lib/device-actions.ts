// Device-specific actions: things the *device* itself can do that the
// designer only names, never understands (2026-08-19 decision, see
// docs/device-contract.md SS5's "Device action registry").
//
// The DDF declares which ids a device offers (device.json's
// `deviceActions[]`), the designer offers exactly those wherever a button
// action is configured, and the firmware decides what each one does. The map
// below only supplies a human-friendly label - an id that isn't in it is
// still offered, verbatim, so a device shipping a new action never has to
// wait for a designer release. Firmware skips-and-logs an unknown id for the
// mirror-image reason: neither side may block on the other's version.
//
// Adding an entry here is a *naming* commitment across every device: the same
// capability must use the same id everywhere, or projects stop being portable
// between devices. Grow it only when a second device really offers one - the
// copy in docs/device-contract.md is the cross-repo half of the same
// registry and must be updated together with this one.
export const DEVICE_ACTION_LABELS: Record<string, string> = {
  showScreenMenu: "Show Screen Menu",
}

// Registry label when the id is known, the raw id otherwise - never an
// "unknown action" placeholder, which would hide from the user the one piece
// of information that still identifies what they picked.
export function describeDeviceAction(deviceActionId: string): string {
  return DEVICE_ACTION_LABELS[deviceActionId] ?? deviceActionId
}
