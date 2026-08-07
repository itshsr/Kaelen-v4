import { useEffect, useRef } from "react";

/**
 * GalaxyBackground
 * Full-viewport, fixed-position, procedurally animated hyper-realistic space
 * background. Mounted once near the root — paints behind everything and is
 * pointer-events: none so it never blocks UI. Self-contained canvas, no assets.
 */
export default function GalaxyBackground({ theme = 'dark', density = 1 }) {
  const canvasRef = useRef(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    // 'off' (density 0) — skip canvas setup entirely; body's flat --bg color
    // shows through instead. Biggest possible battery/perf win for this setting.
    // Guarded inside the effect (not an early return before it) so hooks are
    // still called in the same order every render regardless of density.
    if (density <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    let stars = [];
    let planets = [];
    let nebulae = [];
    let constellations = [];
    let meteors = [];
    let comet = null;

    let targetPX = 0;
    let targetPY = 0;
    let px = 0;
    let py = 0;

    const rand = (a, b) => a + Math.random() * (b - a);

    function buildScene() {
      const cells = [
        [0.08, 0.35, 0.05, 0.28], [0.62, 0.9, 0.08, 0.3], [0.15, 0.4, 0.55, 0.8],
        [0.65, 0.92, 0.55, 0.82], [0.38, 0.6, 0.32, 0.55],
      ]
      planets = cells.map(([x0, x1, y0, y1]) => ({
        x: rand(width * x0, width * x1),
        y: rand(height * y0, height * y1),
        r: rand(Math.min(width, height) * 0.08, Math.min(width, height) * 0.16),
        hue: [220, 30, 190, 260, 40][Math.floor(Math.random() * 5)],
        depth: rand(0.12, 0.3),
      }));
      const area = width * height;
      // 'calm' (density < 1) draws meaningfully fewer stars/flares — this is the
      // main per-frame cost driver, so this is where perf/battery is actually won.
      const starCount = Math.floor(Math.min(2200, Math.floor(area / 900)) * density);
      const flareCount = Math.floor(Math.min(10, Math.max(6, Math.floor(area / 260000))) * density);

      stars = new Array(starCount).fill(0).map((_, i) => {
        const isFlare = i < flareCount;
        const big = Math.random() < 0.06;
        const depth = isFlare
          ? rand(0.9, 1)
          : big
            ? rand(0.7, 0.95)
            : Math.pow(Math.random(), 1.8);
        const warm = Math.random() < 0.07;
        const r = isFlare
          ? rand(1.6, 2.4)
          : big
            ? rand(0.9, 1.6)
            : rand(0.18, 0.55) + depth * rand(0.1, 0.6);
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r,
          baseA: isFlare ? 0.95 : 0.3 + depth * 0.65,
          twSpeed: rand(0.5, 2.4),
          twPhase: Math.random() * Math.PI * 2,
          depth,
          hue: warm ? rand(30, 55) : rand(200, 235),
          warm,
        };
      });

      nebulae = [];
      const bandAngle = rand(-0.35, 0.35);
      const cx = width * 0.5;
      const cy = height * 0.5;
      const bandLen = Math.hypot(width, height);
      const bandBlobs = 9;
      const bandPalette = [215, 225, 200, 260, 280, 320, 340, 190, 250];
      for (let i = 0; i < bandBlobs; i++) {
        const t = i / (bandBlobs - 1) - 0.5;
        const along = t * bandLen * 0.95;
        const perp = rand(-height * 0.18, height * 0.18);
        const x = cx + Math.cos(bandAngle) * along - Math.sin(bandAngle) * perp;
        const y = cy + Math.sin(bandAngle) * along + Math.cos(bandAngle) * perp;
        nebulae.push({
          x, y,
          r: rand(Math.min(width, height) * 0.35, Math.min(width, height) * 0.7),
          hue: bandPalette[i % bandPalette.length],
          alpha: rand(0.18, 0.28),
        });
      }
      const accents = [265, 335, 190, 300];
      for (let i = 0; i < 4; i++) {
        nebulae.push({
          x: rand(width * 0.05, width * 0.95),
          y: rand(height * 0.05, height * 0.95),
          r: rand(Math.min(width, height) * 0.5, Math.min(width, height) * 0.9),
          hue: accents[i],
          alpha: rand(0.09, 0.16),
        });
      }

      constellations = [];
      const bright = stars
        .map((s, i) => ({ s, i }))
        .filter((o) => o.s.depth > 0.75)
        .sort(() => Math.random() - 0.5)
        .slice(0, 40);

      const used = new Set();
      for (let c = 0; c < 4 && bright.length > 4; c++) {
        const seed = bright.find((b) => !used.has(b.i));
        if (!seed) break;
        const cluster = [seed];
        used.add(seed.i);
        const maxDist = Math.min(width, height) * 0.18;
        for (const b of bright) {
          if (used.has(b.i)) continue;
          const dx = b.s.x - seed.s.x;
          const dy = b.s.y - seed.s.y;
          if (Math.hypot(dx, dy) < maxDist) {
            cluster.push(b);
            used.add(b.i);
            if (cluster.length >= 6) break;
          }
        }
        if (cluster.length < 3) continue;
        const path = [cluster[0]];
        const remaining = cluster.slice(1);
        while (remaining.length) {
          const last = path[path.length - 1];
          let bestIdx = 0;
          let bestD = Infinity;
          for (let k = 0; k < remaining.length; k++) {
            const d = Math.hypot(remaining[k].s.x - last.s.x, remaining[k].s.y - last.s.y);
            if (d < bestD) { bestD = d; bestIdx = k; }
          }
          path.push(remaining.splice(bestIdx, 1)[0]);
        }
        const edges = [];
        for (let k = 0; k < path.length - 1; k++) edges.push([path[k].i, path[k + 1].i]);
        constellations.push({ pts: path.map((p) => p.i), edges, alpha: rand(0.06, 0.11) });
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildScene();
    }

    function spawnMeteor() {
      const fromLeft = Math.random() < 0.5;
      const startX = fromLeft ? rand(-50, width * 0.4) : rand(width * 0.6, width + 50);
      const startY = rand(-20, height * 0.4);
      const speed = rand(9, 15);
      const angle = fromLeft ? rand(Math.PI * 0.15, Math.PI * 0.28) : rand(Math.PI * 0.72, Math.PI * 0.85);
      meteors.push({
        x: startX, y: startY,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0, maxLife: rand(40, 70), len: rand(160, 280),
      });
    }

    function spawnComet() {
      const fromLeft = Math.random() < 0.5;
      const startX = fromLeft ? -80 : width + 80;
      const startY = rand(height * 0.1, height * 0.6);
      const targetX = fromLeft ? width + 80 : -80;
      const targetY = startY + rand(-height * 0.25, height * 0.25);
      const dx = targetX - startX;
      const dy = targetY - startY;
      const dist = Math.hypot(dx, dy);
      const speed = rand(1.4, 2.1);
      comet = { x: startX, y: startY, vx: (dx / dist) * speed, vy: (dy / dist) * speed, life: 0, maxLife: dist / speed };
    }

    let last = performance.now();
    let meteorTimer = rand(1.5, 4);
    let cometTimer = rand(30, 40);
    let t = 0;

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      px += (targetPX - px) * 0.12;
      py += (targetPY - py) * 0.12;

      const isLight = themeRef.current === 'light';

      const bg = ctx.createRadialGradient(width * 0.5, height * 0.55, 0, width * 0.5, height * 0.55, Math.max(width, height) * 0.9);
      if (isLight) {
        bg.addColorStop(0, "#eef1f8");
        bg.addColorStop(0.55, "#e3e8f4");
        bg.addColorStop(1, "#d6dcee");
      } else {
        bg.addColorStop(0, "#070b18");
        bg.addColorStop(0.55, "#04060f");
        bg.addColorStop(1, "#010208");
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = isLight ? "source-over" : "screen";
      if (isLight) {
        // Single soft pastel sky wash instead of multiply-blended hue blobs —
        // multiply on a pale base was producing a muddy grey-purple result.
        const wash = ctx.createLinearGradient(0, 0, 0, height);
        wash.addColorStop(0, "rgba(186, 205, 245, 0.62)");
        wash.addColorStop(0.5, "rgba(205, 200, 240, 0.46)");
        wash.addColorStop(1, "rgba(232, 202, 222, 0.5)");
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, width, height);
        // faint tinted pockets, low alpha, additive so they lighten rather than muddy
        ctx.globalCompositeOperation = "lighter";
        for (const n of nebulae) {
          const nx = n.x + px * 0.15;
          const ny = n.y + py * 0.15;
          const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, n.r);
          grad.addColorStop(0, `hsla(${n.hue}, 65%, 82%, ${n.alpha * 0.4})`);
          grad.addColorStop(1, "hsla(0,0%,100%,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, width, height);
        }
      } else {
        for (const n of nebulae) {
          const nx = n.x + px * 0.15;
          const ny = n.y + py * 0.15;
          const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, n.r);
          grad.addColorStop(0, `hsla(${n.hue}, 85%, 62%, ${n.alpha})`);
          grad.addColorStop(0.35, `hsla(${n.hue}, 80%, 48%, ${n.alpha * 0.75})`);
          grad.addColorStop(0.7, `hsla(${n.hue}, 70%, 30%, ${n.alpha * 0.25})`);
          grad.addColorStop(1, "hsla(0, 0%, 0%, 0)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, width, height);
        }
      }
      if (!isLight) {
        ctx.globalCompositeOperation = "lighter";
        for (const n of nebulae) {
          const nx = n.x + px * 0.15;
          const ny = n.y + py * 0.15;
          const core = ctx.createRadialGradient(nx, ny, 0, nx, ny, n.r * 0.35);
          core.addColorStop(0, `hsla(${n.hue}, 90%, 70%, ${n.alpha * 0.35})`);
          core.addColorStop(1, "hsla(0,0%,0%,0)");
          ctx.fillStyle = core;
          ctx.fillRect(0, 0, width, height);
        }
      }
      ctx.globalCompositeOperation = "source-over";

      if (isLight) {
        ctx.globalCompositeOperation = "multiply";
        for (const p of planets) {
          const pxp = p.x + px * p.depth * 0.4;
          const pyp = p.y + py * p.depth * 0.4;
          const g = ctx.createRadialGradient(pxp - p.r * 0.3, pyp - p.r * 0.3, 0, pxp, pyp, p.r);
          g.addColorStop(0, `hsla(${p.hue}, 42%, 86%, 0.12)`);
          g.addColorStop(0.4, `hsla(${p.hue}, 38%, 89%, 0.08)`);
          g.addColorStop(0.75, `hsla(${p.hue}, 35%, 92%, 0.03)`);
          g.addColorStop(1, "hsla(0,0%,100%,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(pxp, pyp, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      }

      for (const c of constellations) {
        ctx.strokeStyle = isLight ? `rgba(70, 80, 125, ${c.alpha * 2.2})` : `rgba(180, 200, 235, ${c.alpha})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (const [a, b] of c.edges) {
          const sa = stars[a], sb = stars[b];
          const pxA = sa.x + px * sa.depth * 0.6, pyA = sa.y + py * sa.depth * 0.6;
          const pxB = sb.x + px * sb.depth * 0.6, pyB = sb.y + py * sb.depth * 0.6;
          ctx.moveTo(pxA, pyA);
          ctx.lineTo(pxB, pyB);
        }
        ctx.stroke();
      }

      ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
      for (const s of stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * s.twSpeed + s.twPhase);
        const a = (isLight ? s.baseA * 0.85 : s.baseA) * tw;
        const sx = s.x + px * s.depth * 0.6;
        const sy = s.y + py * s.depth * 0.6;

        const light = isLight ? 30 : (s.warm ? 85 : 95);
        const sat = isLight ? 45 : (s.warm ? 60 : 30);
        ctx.fillStyle = `hsla(${s.hue}, ${sat}%, ${light}%, ${a})`;
        ctx.beginPath();
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        ctx.fill();

        if (s.depth > 0.7 && !isLight) {
          const glowR = s.r * (s.baseA > 0.9 ? 10 : 6);
          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
          glow.addColorStop(0, `hsla(${s.hue}, 60%, 92%, ${a * 0.5})`);
          glow.addColorStop(0.4, `hsla(${s.hue}, 70%, 70%, ${a * 0.18})`);
          glow.addColorStop(1, "hsla(0,0%,0%,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
          ctx.fill();

          if (s.baseA > 0.9) {
            const spike = s.r * 14;
            const spikeAlpha = a * 0.6;
            const gradH = ctx.createLinearGradient(sx - spike, sy, sx + spike, sy);
            gradH.addColorStop(0, "rgba(255,255,255,0)");
            gradH.addColorStop(0.5, `rgba(230,240,255,${spikeAlpha})`);
            gradH.addColorStop(1, "rgba(255,255,255,0)");
            ctx.strokeStyle = gradH;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx - spike, sy);
            ctx.lineTo(sx + spike, sy);
            ctx.stroke();

            const gradV = ctx.createLinearGradient(sx, sy - spike, sx, sy + spike);
            gradV.addColorStop(0, "rgba(255,255,255,0)");
            gradV.addColorStop(0.5, `rgba(230,240,255,${spikeAlpha})`);
            gradV.addColorStop(1, "rgba(255,255,255,0)");
            ctx.strokeStyle = gradV;
            ctx.beginPath();
            ctx.moveTo(sx, sy - spike);
            ctx.lineTo(sx, sy + spike);
            ctx.stroke();

            ctx.fillStyle = `rgba(255,255,255,${Math.min(1, a)})`;
            ctx.beginPath();
            ctx.arc(sx, sy, s.r * 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalCompositeOperation = "source-over";

      meteorTimer -= dt;
      if (meteorTimer <= 0) { spawnMeteor(); meteorTimer = rand(1.5, 4.5); }
      ctx.globalCompositeOperation = "lighter";
      meteors = meteors.filter((m) => {
        m.life += 1; m.x += m.vx; m.y += m.vy;
        const t01 = m.life / m.maxLife;
        if (t01 >= 1) return false;
        const fade = t01 < 0.1 ? t01 / 0.1 : 1 - (t01 - 0.1) / 0.9;
        const alpha = Math.max(0, fade);
        const speed = Math.hypot(m.vx, m.vy);
        const dirX = m.vx / speed, dirY = m.vy / speed;
        const tailX = m.x - dirX * m.len, tailY = m.y - dirY * m.len;

        const outer = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        outer.addColorStop(0, "rgba(160,200,255,0)");
        outer.addColorStop(1, `rgba(200,225,255,${alpha * 0.35})`);
        ctx.strokeStyle = outer;
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(m.x, m.y); ctx.stroke();

        const core = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        core.addColorStop(0, "rgba(255,255,255,0)");
        core.addColorStop(0.85, `rgba(240,248,255,${alpha * 0.85})`);
        core.addColorStop(1, `rgba(255,255,255,${alpha})`);
        ctx.strokeStyle = core;
        ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(m.x, m.y); ctx.stroke();

        const halo = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 6);
        halo.addColorStop(0, `rgba(255,255,255,${alpha})`);
        halo.addColorStop(0.4, `rgba(200,220,255,${alpha * 0.6})`);
        halo.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(m.x, m.y, 6, 0, Math.PI * 2); ctx.fill();
        return true;
      });
      ctx.globalCompositeOperation = "source-over";

      cometTimer -= dt;
      if (cometTimer <= 0 && !comet) { spawnComet(); cometTimer = rand(30, 45); }
      if (comet) {
        comet.life += 1; comet.x += comet.vx; comet.y += comet.vy;
        const t01 = comet.life / comet.maxLife;
        if (t01 >= 1 || comet.x < -120 || comet.x > width + 120) {
          comet = null;
        } else {
          const speed = Math.hypot(comet.vx, comet.vy);
          const dirX = comet.vx / speed, dirY = comet.vy / speed;
          const tailLen = 220;
          const tx = comet.x - dirX * tailLen, ty = comet.y - dirY * tailLen;
          const fade = t01 < 0.1 ? t01 / 0.1 : t01 > 0.9 ? (1 - t01) / 0.1 : 1;

          ctx.globalCompositeOperation = "lighter";
          const g1 = ctx.createLinearGradient(tx, ty, comet.x, comet.y);
          g1.addColorStop(0, "rgba(160,190,240,0)");
          g1.addColorStop(1, `rgba(200,220,255,${0.35 * fade})`);
          ctx.strokeStyle = g1;
          ctx.lineWidth = 6;
          ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(comet.x, comet.y); ctx.stroke();

          const g2 = ctx.createLinearGradient(tx, ty, comet.x, comet.y);
          g2.addColorStop(0, "rgba(255,255,255,0)");
          g2.addColorStop(1, `rgba(255,255,255,${0.8 * fade})`);
          ctx.strokeStyle = g2;
          ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(comet.x, comet.y); ctx.stroke();

          const gh = ctx.createRadialGradient(comet.x, comet.y, 0, comet.x, comet.y, 14);
          gh.addColorStop(0, `rgba(255,255,255,${fade})`);
          gh.addColorStop(0.4, `rgba(200,220,255,${0.5 * fade})`);
          gh.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = gh;
          ctx.beginPath(); ctx.arc(comet.x, comet.y, 14, 0, Math.PI * 2); ctx.fill();
          ctx.globalCompositeOperation = "source-over";
        }
      }

      raf = requestAnimationFrame(frame);
    }

    function onMouse(e) {
      const nx = (e.clientX / width) * 2 - 1;
      const ny = (e.clientY / height) * 2 - 1;
      targetPX = -nx * 90;
      targetPY = -ny * 90;
    }

    function onOrient(e) {
      if (e.gamma == null || e.beta == null) return;
      targetPX = -(e.gamma / 45) * 90;
      targetPY = -(e.beta / 45) * 90;
    }

    let raf = 0;
    let running = true;

    function startLoop() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stopLoop() {
      running = false;
      cancelAnimationFrame(raf);
    }
    function onVisibility() {
      if (document.hidden) stopLoop();
      else startLoop();
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("deviceorientation", onOrient);
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);

    return () => {
      stopLoop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("deviceorientation", onOrient);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="galaxy-bg"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
        display: "block",
        background: "#02040a",
      }}
    />
  );
}
