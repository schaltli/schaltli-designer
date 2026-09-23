// Which of a project's assets something still uses - what Remove Unused Assets
// keeps (components/project-settings-dialog.tsx).
//
// It used to list the places an asset can be used: a screen's background image,
// an Icon's asset, a Live Icon's rules, on objects at the top level of a screen.
// Every other place was missed - a Button's or Switch state's icon, a Bar's, a
// screen's own icon, anything inside a Switcher's panels - and the button
// deleted icons still on screen, with no undo (issue #7). A list of places is
// a list that falls behind the next property that takes an icon.
//
// So nothing is listed: every string anywhere in the project except the asset
// library itself is a possible reference, and an asset stays if its id is
// among them. An id is a generated key, so a string that merely looks like one
// by accident costs at most an asset kept that could have gone - the safe way
// to be wrong.
export function assetIdsInUse(project: object): Set<string> {
  const found = new Set<string>()
  const walk = (value: unknown) => {
    if (typeof value === "string") found.add(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === "object") Object.values(value).forEach(walk)
  }
  for (const [key, value] of Object.entries(project)) {
    if (key !== "assets") walk(value)
  }
  return found
}
