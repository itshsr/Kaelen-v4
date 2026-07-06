import { useEffect, useRef } from 'react'

// Layered starfield + constellation lines with pointer parallax.
// Canvas 2D with depth layers — light, mobile-safe. r3f upgrade path reserved for HOME hero.
export default function Starfield() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    let w, h, raf
    let px = 0, py = 0, tx = 0, ty = 0
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dark = document.documentElement.dataset.theme !== 'light'

    const resize = () => {
      w = canvas.width = canvas.offsetWidth * devicePixelRatio
      h = canvas.height = canvas.offsetHeight * devicePixelRatio
    }
    resize()
    window.addEventListener('resize', resize)

    const rand = (a, b) => a + Math.random() * (b - a)
    const layers = [0.25, 0.55, 1].map((depth, li) => ({
      depth,
      stars: Array.from({ length: li === 2 ? 40 : 90 }, () => ({
        x: Math.random(), y: Math.random(),
        r: rand(0.4, li === 2 ? 1.8 : 1.1) * devicePixelRatio,
        tw: rand(0.002, 0.012), ph: rand(0, Math.PI * 2),
      })),
    }))

    // constellation nodes (foreground layer subset)
    const nodes = layers[2].stars.slice(0, 14)

    const move = e => {
      const cx = e.touches ? e.touches[0].clientX : e.clientX
      const cy = e.touches ? e.touches[0].clientY : e.clientY
      tx = (cx / window.innerWidth - 0.5) * 2
      ty = (cy / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('pointermove', move, { passive: true })

    let t = 0
    const draw = () => {
      t++
      px += (tx - px) * 0.04
      py += (ty - py) * 0.04
      ctx.clearRect(0, 0, w, h)

      layers.forEach(({ depth, stars }) => {
        const ox = -px * depth * 30 * devicePixelRatio
        const oy = -py * depth * 30 * devicePixelRatio
        stars.forEach(s => {
          const a = 0.35 + 0.65 * Math.abs(Math.sin(t * s.tw + s.ph))
          ctx.beginPath()
          ctx.fillStyle = dark
            ? `rgba(190, 205, 255, ${a * (0.3 + depth * 0.7)})`
            : `rgba(47, 85, 230, ${a * 0.35 * depth})`
          ctx.arc(s.x * w + ox, s.y * h + oy, s.r * (0.6 + depth * 0.6), 0, 7)
          ctx.fill()
        })
      })

      // constellation lines
      const ox = -px * 30 * devicePixelRatio, oy = -py * 30 * devicePixelRatio
      ctx.lineWidth = 0.6 * devicePixelRatio
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = (a.x - b.x) * w, dy = (a.y - b.y) * h
          const d = Math.hypot(dx, dy)
          if (d < w * 0.14) {
            const alpha = (1 - d / (w * 0.14)) * (dark ? 0.28 : 0.16)
            ctx.strokeStyle = dark ? `rgba(122, 92, 255, ${alpha})` : `rgba(98, 71, 214, ${alpha})`
            ctx.beginPath()
            ctx.moveTo(a.x * w + ox, a.y * h + oy)
            ctx.lineTo(b.x * w + ox, b.y * h + oy)
            ctx.stroke()
          }
        }
      }

      if (!reduced) raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', move)
    }
  }, [])

  return <canvas ref={ref} className="star-canvas" aria-hidden="true" />
}
