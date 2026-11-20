# waveshare-7 - todo

Plan: `tasks/waveshare-7-plan.md`. Firmware work in `schaltli-firmware`.
Each code task: `npm run typecheck`, then `npm run test:quick` (CLAUDE.md);
name the test added and the handbook page changed when reporting.

- [x] T1 (Tobi in 2781, Chris in 2558 from Mon 2026-11-16) The 4.3B factory image on their 7" via the web flasher. Chris also has a 7B (1024 × 600): not this task, only its boot log and a photo of the back.
  - 2026-11-14 Chris (2558 #11): flashes, screen dark; log `CH422G init FAILED`, `GT911 not found on 0x5D or 0x14`, panel and render ok. Nothing answers on I2C 8/9, although his ESPHome finds CH422G (0x20-0x3F) and GT911 0x5D on the same pins and logs «Recovery: bus successfully recovered» first. Suspect: no bus recovery in `startExpander()` (rgbpanel/main.cpp). Asked: cold start (power off 10 s), which board (7 or 7B), which USB port. If still dark -> T2 with I2C recovery + scan.
  - 2026-11-16 Tobi (2781 #26): flashed via the web flasher, QR code shows, setup page reachable; Schaltli on his Pi, a test page with two buttons and a text deployed - «funktioniert». So the 4.3B image runs on his 7" with touch. Asked: photo of the screen, touch in the corners exact? Then -> T3. Chris's dark 7" is therefore board-specific (7B? hung bus?), not the 7" in general.
  - 2026-11-16 Chris (2558 #15): on his «old» 7" (the same model as Tobi's) the 4.3B image turns the LCD white, flickering now and then, nothing else; the 4" image: only the backlight (expected, other panel). The 7B loads via pio, also no picture, backlight on another controller. White = backlight on, so the expander answers on this board - unclear which board the #11 log came from. Asked: serial log of the old 7" with the 4.3B image, photo of the back (revision vs Tobi's), which board #11 was.
  - 2026-11-17 Chris (2558 #17): old 7" is **Rev 1.2** (photo). No reset after flashing; after a manual reset white + flicker = boot loop: `Guru Meditation Error: Core 0 panic'ed (Cache disabled but cached memory region accessed)` right after the three `nvs_open failed: NOT_FOUND` (~2.1 s), backtrace left out. ELF SHA 6a02219d5 = our official fw-2026.11.10.1 4.3B bin (checked against dist/), so the same image as Tobi's working 7" -> hardware difference (revision?). His log shows no `[4v3b]` lines: probably the UART port, our Serial is USB CDC. #11 was the 7B (confirmed); he is adapting the 7B backlight himself. Asked: full backtrace line, Tobi's revision. Decode: no ELF kept for releases - rebuild tag fw-2026.11.10.1 for addr2line.
  - 2026-11-17 (2558 #18-#25): Chris's own env `waveshare-touch-lcd-7v12` (4.3B profile, PCLK 16 MHz, bounce buffer W*20 px - Waveshare's 7" example values) runs: QR, WiFi, test card. Tobi's 7" is **also Rev 1.2**, so not the revision. Asked Chris to test the bounce buffer alone at 12 MHz. No serial device on the 7"'s USB port with our image: Ch422g starts with all outputs high, and on the 7" EXIO5 USB_SEL high routes GPIO19/20 to CAN (FSUSB42UMX) and disables USB (Waveshare's own examples say so) -> the 7" env must drive USB_SEL low (T4). Check: BOOT held while plugging in should enumerate.
  - 2026-11-17 Tobi (2781 #32): photo of his test page over six screens - fills the screen, colours right, touch exact. Rev 1.2.
  - 2026-11-17/18 Chris (2558 #27, #30): 12 MHz with the 20-line buffer does not run; **16 MHz with the old buffer `PANEL_W * 10` runs**. So the 7" needs Waveshare's 16 MHz, the buffer stays. WiFi at 16 MHz still open (he has no designer yet).
  - **Done 2026-11-19: picture and touch pass on Tobi's board -> T3/T4; T2 not needed.** Active area: Waveshare states none (wiki, product page); T3 takes the usual 7" 800 × 480 glass (154.21 × 85.92 mm) until a photo with a ruler confirms it.
  - Before: photo of the back (revision); forum post with the steps and the way back (draft by me, posted by the user).
  - Report: photo of the screen with the setup QR code, a tap, the flasher's log.
  - Accept: picture straight and full, colours right, touch where the finger is -> T3. Otherwise -> T2.
- [x] T2 (only if T1 fails) - not needed (T1 passed) Probe build `waveshare-touch-lcd-7-probe`: numbered timing sets with colour bars, touch and expander probes, all over serial.
  - Accept: builds; on the 4.3B on the bench every set shows its number and the log names GT911 and CH422G (the 4.3B stands in for the 7"); `e2e/firmware-build.spec.ts` covers the env.
  - Files: src/boards/probe7/*, platformio.ini, e2e/firmware-build.spec.ts. Size M.
- [x] T3 DDF `ddf-source-waveshare7/`: id `waveshare-touch-lcd-7`, 800 × 480, px/mm from the active area (Tobi's photo with a ruler), frame SVG with `<rect id="screen">`, fonts; zip in `public/ddf/`, `--check` in test:all.
  - Accept: the designer offers the board and draws its frame; it is in `e2e/ddf-seed.ts` and the specs that list every board.
  - Size M.
  - 2026-11-19 done: 154.21 × 85.92 mm (5.39 px/mm, not measured - Waveshare states no active area; confirm with a ruler photo from Tobi), glass 192.96 × 110.76 from the wiki. Fonts by build-typography-fonts.py (Seven Segment 33 px), `replaces` worked out once from the PaperS3's 1-bit list. `waveshare7-ddf` check in test:all; in ddf-seed.ts, size-scale, new-project, handbook-screenshots; native test_font_index.
- [x] T4 Env `waveshare-touch-lcd-7`: the 4.3B profile with USB_SEL (EXIO5) low and the bounce buffer that fixes Chris's board, own `DeviceInfo.h` / `ddf_zip.h`; entry in `tools/release-firmware.js`; a release (the user's).
  - Accept: `pio run -e waveshare-touch-lcd-7` and the 4.3B env build; `e2e/firmware-build.spec.ts` covers it; 4.3B lane in test:quick unchanged.
  - Size S.
  - 2026-11-19 done except the release: src/boards/waveshare7/ sets BOARD_PCLK_HZ 16 MHz, CH422G_IO_AT_START with EXIO5 low (Waveshare: «Pull down to USB mode, otherwise CAN mode»), BOARD_LOG, and includes the 4.3B's BoardProfile.h, whose values became overridable defaults. Both envs build; firmware-build and factory-image specs cover the env. **Open: a release (the user's), then Checkpoint A.**
- [ ] Checkpoint A: Tobi flashes the 7" image from the flasher, deploys a designer project, it is drawn at the right size and touch works.
- [x] T5 Flasher entry and handbook page `geraete/waveshare-7.md` (which USB port, «tested by a user»), device overview; humanizer; `e2e/handbook-labels.spec.ts` green.
  - 2026-11-19: flasher/boards.mjs (UART socket, not the 7B; until a release the flasher shows «No factory image in the published releases yet.»), handbuch/geraete/waveshare-7.md, index (table + picture), einrichten (setup WLAN, gesture), sidebar.
- [ ] Checkpoint B: the user reads the page; forum reply to Tobi (draft by me).

## Draft forum reply (2781, after the release - posted by the user)

Hallo Tobi, hallo Chris

Das 7" ist jetzt ein eigenes Gerät. Im Flasher steht «Waveshare ESP32-S3 Touch LCD 7"», und im Designer gibt es dafür einen eigenen Rahmen in der echten Grösse. Die Schriften sind auf das grössere Glas abgestimmt.

Zwei Dinge sind anders als beim Image fürs 4.3B: Es läuft mit 16 MHz, wie Waveshare es vorgibt. Damit startet auch Chris' Board. Und die Buchse «USB» bleibt jetzt eingeschaltet, man sieht dort also das Log und kann darüber flashen. Zum Flashen nehmt ihr aber am besten weiter die Buchse «UART».

Tobi, deinen Entwurf stellst du unter «Settings» › «Device» auf das 7" um. Deine Objekte bleiben, wo sie sind, nur die Schriften kommen dann vom 7".

Die aktive Fläche habe ich vom üblichen 7"-Glas übernommen (154 × 86 mm), Waveshare nennt keine. Falls einer von euch mal einen Massstab neben den Screen legt und ein Foto macht, kann ich nachmessen.

Gruss
Matthias
