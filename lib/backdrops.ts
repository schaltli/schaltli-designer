// What can lie behind the device on the canvas, as CSS (components/canvas).
//
// Black felt: fine white noise, faint, on near black, darker towards the edges.
const FELT_NOISE = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.11 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`
export const FELT_BACKDROP = {
  backgroundColor: "#161616",
  backgroundImage: `radial-gradient(ellipse at center, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.45) 100%), ${FELT_NOISE}`,
}

// The same felt as it is at the edge of FELT_BACKDROP, for a strip that
// carries on from its bottom edge without a seam.
export const FELT_EDGE = {
  backgroundColor: "#161616",
  backgroundImage: `linear-gradient(rgba(0,0,0,0.42), rgba(0,0,0,0.45)), ${FELT_NOISE}`,
}
