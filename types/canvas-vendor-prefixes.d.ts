// The pre-standard image-smoothing switches, declared so the pixel-perfect
// canvas setup can keep setting them without a cast at every line.
//
// They are real: before `imageSmoothingEnabled` was standardised, each
// engine shipped its own prefixed version, and old WebKit/Gecko/Trident
// builds honour only those. TypeScript's DOM library only knows the
// standard one, which is correct for a spec but wrong for what actually
// runs. Setting an unknown property is a no-op in JavaScript, so leaving
// them in costs nothing on a modern browser and still does the job on an
// old one - this app is meant to run on whatever the user has on the LAN.
//
// Declared optional deliberately: they are absent on every current engine,
// so code must never *read* them and conclude anything. Writing is the only
// supported use, which is all lib/font-utils.ts and lib/bdffont.ts do.
interface CanvasRenderingContext2D {
  mozImageSmoothingEnabled?: boolean
  webkitImageSmoothingEnabled?: boolean
  msImageSmoothingEnabled?: boolean
}
