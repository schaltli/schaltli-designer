/**
 * Der Schaltli-Auftritt.
 *
 * Eine liegende Pille, in der eine Kugel nach rechts rollt. Am Anschlag
 * bleibt die Kugel liegen und die Pille stellt sich um sie herum auf - 90
 * Grad, nicht mehr. Dann steigt die Pille an ihren Platz im Schriftzug und
 * bremst dort ab; die Kugel laeuft aus Traegheit weiter und schlaegt oben an,
 * wo sie als Tuepfelchen des i liegen bleibt. Waehrenddessen erscheinen die
 * Buchstaben von links nach rechts.
 *
 * Das ist dieselbe Mechanik wie beim Kapsel-Spielzeug: ein Impuls, der
 * zwischen zwei Koerpern hin und her geht. Beim Rollen liegt die Pille
 * bewusst waagrecht - physikalisch muesste die Flaeche geneigt sein, aber die
 * ruhige Waagrechte ist das bessere Bild.
 *
 * Keine Abhaengigkeiten, keine Schriftlieferung: die Buchstaben stecken als
 * Umrisse in glyphs.js. Lade diese Datei davor.
 *
 *   <script src="glyphs.js"></script>
 *   <script src="intro.js"></script>
 *   <script>schaltliIntro(document.getElementById("logo"))</script>
 *
 * Optionen: { ink, loop, scale, onDone }
 */
;(function () {
  "use strict"

  var G = window.SCHALTLI_GLYPHS
  // Zeitplan in Sekunden
  var T = { hold: 0.35, roll: 0.7, stand: 0.5, rise: 0.7, rest: 1.1 }
  var T1 = T.hold, T2 = T1 + T.roll, T3 = T2 + T.stand, T4 = T3 + T.rise
  var TOTAL = T4 + T.rest

  function clamp01(u) { return u < 0 ? 0 : u > 1 ? 1 : u }
  function smooth(u) { return u * u * (3 - 2 * u) }

  // Kippen: langsam aus der Balance, dann faellt es, dann ein kurzes Nachwippen.
  function tip(u) {
    if (u >= 1) return 1
    if (u > 0.88) {
      var k = (u - 0.88) / 0.12
      return 1 + 0.055 * Math.sin(k * Math.PI * 2.2) * (1 - k)
    }
    return Math.pow(u, 2.1)
  }

  function pose(t) {
    var cap = G.cap
    var reach = (cap.h - cap.w) / 2
    var lieCY = cap.y + cap.h + 34 - cap.w / 2   // Rollhoehe: unter der Grundlinie
    var standCY = lieCY - reach
    var p = { ang: 0, ballT: -1, cx: cap.x + cap.w / 2 - reach, cy: lieCY, letters: 0 }

    if (t < T1) return p

    if (t < T2) {
      p.ballT = -1 + 2 * Math.pow(clamp01((t - T1) / T.roll), 1.8)
      return p
    }

    if (t < T3) {
      var u = clamp01((t - T2) / T.stand)
      p.ballT = 1
      p.ang = (Math.PI / 2) * tip(u)
      // Die Kugel bleibt liegen, die Pille dreht sich um sie.
      var bx = cap.x + cap.w / 2, by = lieCY
      p.cx = bx - Math.cos(p.ang) * reach
      p.cy = by - Math.sin(p.ang) * reach
      return p
    }

    var v = clamp01((t - T3) / T.rise)
    var e = smooth(v)
    p.ang = Math.PI / 2
    p.cx = cap.x + cap.w / 2
    p.cy = standCY + (cap.y + cap.h / 2 - standCY) * e
    p.letters = v
    // Traegheit: die Pille bremst oben ab, die Kugel laeuft weiter und
    // schlaegt an - deshalb passiert fast alles im letzten Drittel.
    var k = Math.pow(v, 2.8)
    p.ballT = 1 - 2 * k
    if (v > 0.86) {
      var j = (v - 0.86) / 0.14
      p.ballT += 0.07 * Math.sin(j * Math.PI * 2) * (1 - j)
    }
    return p
  }

  function schaltliIntro(el, opts) {
    opts = opts || {}
    if (!G) throw new Error("glyphs.js fehlt - es muss vor intro.js geladen werden")
    var ink = opts.ink || "#111111"
    var knock = opts.knock || "#ffffff"
    var scale = opts.scale || 1
    var vb = G.viewBox.split(/\s+/).map(Number)
    var W = vb[2], H = vb[3] + 44        // Platz fuer den Anlauf unter der Linie
    var dpr = Math.min(3, window.devicePixelRatio || 1)

    var c = document.createElement("canvas")
    c.style.width = W * scale + "px"
    c.style.height = H * scale + "px"
    c.width = Math.round(W * scale * dpr)
    c.height = Math.round(H * scale * dpr)
    c.setAttribute("role", "img")
    c.setAttribute("aria-label", "Schaltli")
    el.appendChild(c)
    var g = c.getContext("2d")

    var letterPaths = G.letters.map(function (l) { return new Path2D(l.d) })

    function frame(p) {
      // Erst in Geraetepixeln loeschen, dann skalieren. Umgekehrt loescht
      // clearRect(0,0,W,H) nur W*scale*dpr Pixel, und weil die Leinwand auf
      // ganze Pixel gerundet ist, bleibt rechts (und unten) ein Bruchteil
      // einer Spalte stehen - eine feine Linie, die nie wieder verschwindet.
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, c.width, c.height)
      g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)
      g.save()
      g.translate(-vb[0], -vb[1])        // Grundlinie an ihren Platz
      // Buchstaben, nacheinander
      for (var i = 0; i < letterPaths.length; i++) {
        var start = i / (letterPaths.length + 2)
        var a = clamp01((p.letters - start) / 0.34)
        if (a <= 0) continue
        g.save()
        g.globalAlpha = a
        g.translate(0, (1 - a) * 10)
        g.fillStyle = ink
        g.fill(letterPaths[i])
        g.restore()
      }
      // die Pille
      var cap = G.cap, reach = (cap.h - cap.w) / 2
      g.save()
      g.translate(p.cx, p.cy)
      g.rotate(p.ang)
      g.fillStyle = ink
      roundRect(g, -cap.h / 2, -cap.w / 2, cap.h, cap.w, cap.w / 2)
      g.fill()
      g.restore()
      // die Kugel
      g.fillStyle = knock
      g.beginPath()
      g.arc(p.cx + Math.cos(p.ang) * p.ballT * reach,
            p.cy + Math.sin(p.ang) * p.ballT * reach, cap.ballR, 0, Math.PI * 2)
      g.fill()
      g.restore()
    }

    // Wer Bewegung abbestellt hat, bekommt sofort das Ergebnis.
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (still) { frame(pose(TOTAL)); return { canvas: c, replay: function () {} } }

    var t0 = null
    function loop(now) {
      if (t0 === null) t0 = now
      var t = (now - t0) / 1000
      frame(pose(Math.min(t, TOTAL)))
      if (t < TOTAL) return requestAnimationFrame(loop)
      if (opts.loop) { t0 = null; return requestAnimationFrame(loop) }
      if (opts.onDone) opts.onDone()
    }
    requestAnimationFrame(loop)

    return { canvas: c, replay: function () { t0 = null; requestAnimationFrame(loop) } }
  }

  function roundRect(g, x, y, w, h, r) {
    if (g.roundRect) { g.beginPath(); g.roundRect(x, y, w, h, r); return }
    g.beginPath()
    g.moveTo(x + r, y)
    g.arcTo(x + w, y, x + w, y + h, r)
    g.arcTo(x + w, y + h, x, y + h, r)
    g.arcTo(x, y + h, x, y, r)
    g.arcTo(x, y, x + w, y, r)
    g.closePath()
  }

  window.schaltliIntro = schaltliIntro
})()
