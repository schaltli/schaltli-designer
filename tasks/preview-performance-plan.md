# Implementation plan: preview performance (`preview-performance`, #58)

Spec: `docs/2026-10-09-preview-performance.md` (agreed 2026-10-09). Tasks:
`tasks/preview-performance-todo.md`. Chat German, docs English.

## Overview

The live preview stalls on a slow browser when a large project takes in a
stream of values: every value redraws the canvas twice, and every redraw
rasterizes every Switch's pills anew. Cache the pills' coverage, draw once
per change, take values in once per frame.

## Order

1. The test, red (done with this plan: 787 ms, then never within 20 s).
2. Coverage cache - the largest share of the time.
3. Resize on a size change only - halves the draws.
4. Values once per frame - bounds the draws by the screen's rate.
5. Profile again, the test green, `test:all`.

Each step is measured with the test before the next; if the test is green
early, the later steps still go in - they are what makes a tablet work.
