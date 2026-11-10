/**
 * How large a Camera may be (docs/2026-11-09-camera.md, decision 8): the same
 * on every device. VGA missed the frame rate on the 4", so 320x240 is the top.
 */
export const CAMERA_MIN = { width: 80, height: 60 } as const
export const CAMERA_MAX = { width: 320, height: 240 } as const

export function clampCameraSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.min(CAMERA_MAX.width, Math.max(CAMERA_MIN.width, Math.round(Math.abs(width)))),
    height: Math.min(CAMERA_MAX.height, Math.max(CAMERA_MIN.height, Math.round(Math.abs(height)))),
  }
}
