import { existsSync } from "fs"
import { join } from "path"

/**
 * Where files go that a device fetches once and nobody keeps: a deploy's
 * bundle, a firmware image on its way to a board.
 *
 * On Linux that is RAM (/dev/shm), not the disk. On the Pekaway the disk is an
 * SD card, and the designer should write to it only what someone means to
 * keep - saved projects (the user, 2026-09-28: "auf ein absolutes minimum
 * reduzieren"). RAM rather than the process's own memory, because the
 * designer stops when idle (deploy/pekaway-install.sh) and a device that was
 * off during a deploy fetches its retained bundle later: /dev/shm outlives
 * the designer, only not a reboot, after which the device reports the
 * download failed and the deploy is simply sent again.
 *
 * Everywhere else - Windows, a Mac - the old place under .data, which the
 * tests clean up. SCHALTLI_VOLATILE_DIR overrides both.
 */
export function volatileDir(name: "deploys" | "firmware-uploads"): string {
  const base =
    process.env.SCHALTLI_VOLATILE_DIR ||
    (process.platform === "linux" && existsSync("/dev/shm") ? "/dev/shm/schaltli" : join(process.cwd(), ".data"))
  return join(base, name)
}
