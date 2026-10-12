# Plan: the energy diagram on the knob and the PaperS3

Asked by the user 2026-10-12: «der knob und der paperS3 brauchen das
Control auch. beim PaperS3 einfach nicht animiert, aber beim Knob schon.»
Approved with the two decisions below («ja, so machen, plan schreiben und
los»). Changes spec decision 15 (was: the 4.3B and Android only).

Both boards draw with the shared ColorScreenRenderer, which already draws
the diagram (device contract 2.8). What is missing is around it.

## Decisions (approved)

1. **Gated by the device's type list, not by a generation.** The knob is
   at 1.4 (no navigator, which came with 1.5 and 1.6); 1.7 would claim the
   navigator. The Deploy dialog already fetches the chosen device's DDF
   from its firmware and refuses a type it does not list. So the energy
   diagram's need for generation 1.7 goes; a device whose firmware lists
   the type can show it. 4.3B and Android keep announcing 1.7.
2. **The PaperS3 does not animate.** Its DDF says so (`screen.motion:
   false`); the designer then draws the diagram still - the preview too -
   and shows no «Motion». The board draws the dots where phase 0 has them,
   as any device does with Motion off.

## Tasks

- **K1 Designer: the type list gates, a device can say it does not
  animate.** The 1.7 need out of the Deploy dialog (its test changes);
  `screen.motion` read from a DDF into the project's settings; a diagram
  on such a device drawn still, «Motion» hidden. Contract 2.8 and the
  spec amended. Tests: e2e.
- **K2 Knob firmware.** DDF lists the type; it subscribes to the nodes'
  topics (collectTopics missed them); a tap on a node runs its action;
  motion: dots drawn into the canvas over a kept still copy, only their
  boxes handed to LVGL, ~10 steps/s, none while a finger is down, the
  ring is turned, a swipe runs, a popup is open or the panel is dark.
- **K3 PaperS3 firmware.** DDF lists the type and says it does not
  animate; the renderer draws the dots at phase 0 there; a tap runs the
  node's action; kept pictures limited by free PSRAM.
- **K4 HIL.** The conformance specimen fits a round screen (both modes
  inside the safe square, one above the other); knob: the glass moves
  inside the diagram only and a tap is no slower for it; PaperS3: pixel
  compare of the still picture.
- **K5 Handbook.** Which devices show it, the PaperS3 still; device pages.
- **Checkpoint:** test:all green; the user looks at the knob and the
  PaperS3.
