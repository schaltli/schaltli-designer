# The heater on a weekly plan

Idea written down with the user on 2026-11-06, after looking at how
CamperUI drives heaters (github.com/NiklasJester/CamperUI, ef71e15): it
has neither a timer nor a schedule for the Autoterm. Pekaway has a weekly
scheduler of its own, which docs/2026-10-05-autoterm-block.md left where it
is («No weekly schedule»). The user finds it falls short: it switches once
on and once off a day, and says nothing about how to heat.

Status: idea. No spec yet.

## Problem Statement

How might we let a van heat itself the way people actually use it - on
Monday from 8 to 9 and from 16 to 22, at 22 °C, or at power 5 to warm up
fast - without two schedulers fighting over the heater?

## The user's model

The heater is under exactly one control at a time, and a switch says which:

| Control | Who decides | What is set |
|---|---|---|
| **Direct** | the person, now | Betrieb (Aus · Temperatur · Leistung · Lüften) and its value, as today |
| **Timer** | a countdown | the same, and for how long; off when it runs out |
| **Weekly plan** | the plan | time windows per weekday, each with its Betrieb and value |

Outside every window the plan keeps the heater off.

This settles what a hand on the heater means: not an override the plan has
to forgive, but a change of control. To heat now while on the plan, switch
to Direct.

## What follows from it

- **The timer becomes a control.** Today it is a switch of its own beside
  the Betrieb (`heater/timer_on`, `heater/runtime`, `heater/runtime_left`).
  As one of three controls it is simpler than now.
- **On the plan the block shows what the plan wants** - «Plan: 22 °C bis
  22:00», «Plan: aus, nächstes Fenster Di 08:00» - rather than controls
  that would only fight it.
- **The plan runs on the Pekaway, in the VanPi bridge**, so the heater
  starts whether or not a display is on. The bridge already drives every
  mode of the Autoterm through Pekaway's HTTP API.
- **Pekaway's own scheduler is off** while ours is used; two schedulers on
  one heater would switch against each other. The handbook says so.
- **Testable here:** the Autoterm hangs in the van, and the user would use
  this himself - unlike a Webasto or a Truma, for which nobody can test
  (see «Not doing»).

## Key Assumptions to Validate

- [ ] Windows with a mode and a value per weekday cover what people do;
      ask in the Pekaway forum how they heat and what Pekaway's scheduler
      lacks.
- [ ] The bridge can keep time reliably on the Pekaway (clock, restart in
      the middle of a window: it starts the heater if a window is open).
- [ ] Pekaway's scheduler can be told apart and switched off, or at least
      detected, so the two never both drive the heater.

## Open Questions

- **Where are the windows set?** The biggest piece. On a display it needs
  a new object - a week with its windows, editable by finger. In the
  designer it would be a dialog, but then the plan cannot be changed on
  the road. Or, at first, in a page the bridge serves on the Pekaway.
- **One plan or several** (weekday, weekend, «away»)?
- **Frost protection** outside the windows instead of off?
- **What the device shows** when the plan starts the heater, and whether a
  window that was cut short by hand ends the plan for that day.

## Not doing (and why)

- **Webasto and Truma control** for now: CamperUI shows the way (Pekaway's
  generic `/heater/true/<temp>`, and `/truma_ci/…` for a Truma Combi), but
  nobody here has the hardware to test. A question in the Pekaway forum
  first; built once someone will test it.
- **A schedule inside the display firmware**: the heater has to run when
  no display is on.
