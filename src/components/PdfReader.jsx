import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const SWIPE_THRESHOLD = 60 // px, before a horizontal drag counts as a page-turn swipe
const ZOOM_MIN = 1
const ZOOM_MAX = 3
const DOUBLE_TAP_ZOOM = 2.2
const DOUBLE_TAP_MS = 300
const TURN_EASE = 'cubic-bezier(0.4, 0.0, 0.2, 1)'

const EFFECTS = [
  { id: 'fade', label: 'Fade', ms: 130 },
  { id: 'curl', label: 'Curl', ms: 240 },
  { id: 'slide', label: 'Slide', ms: 240 },
  { id: 'instant', label: 'Instant', ms: 0 },
]
const effectMs = id => EFFECTS.find(e => e.id === id)?.ms ?? 240

// Style at the moment the OLD page finishes exiting (about to swap content).
function exitStyle(effect, dir) {
  if (effect === 'slide') return { transform: `translateX(${dir === 'next' ? '-100%' : '100%'})`, opacity: 1 }
  // Fade previously dipped nearly to 0 opacity, which — over the dark reader
  // background — read as a flash of black between pages, breaking reading
  // flow. It now only dips to a light dim, quickly, so it barely registers as
  // more than a soft settle rather than an actual disappearance.
  if (effect === 'fade') return { transform: 'none', opacity: 0.55 }
  // curl — old page pivots away around the edge it's turning toward
  return {
    transform: `rotateY(${dir === 'next' ? -80 : 80}deg) scale(0.94)`, opacity: 0.15,
    transformOrigin: dir === 'next' ? '100% 50%' : '0% 50%',
  }
}
// Style applied INSTANTLY (no transition) the moment the NEW page's content is
// drawn, before animating to settled — this is what the old version was
// missing, which is why the flip looked like it glitched mid-flight: it kept
// interpolating continuously through the content swap instead of resetting.
function enterStartStyle(effect, dir) {
  if (effect === 'slide') return { transform: `translateX(${dir === 'next' ? '100%' : '-100%'})`, opacity: 1 }
  if (effect === 'fade') return { transform: 'none', opacity: 0.55 }
  return {
    transform: `rotateY(${dir === 'next' ? 80 : -80}deg) scale(0.94)`, opacity: 0.15,
    transformOrigin: dir === 'next' ? '0% 50%' : '100% 50%',
  }
}
const settledStyle = { transform: 'none', opacity: 1 }

/**
 * Full-screen in-app PDF reader — pages render to a canvas via pdf.js (not a
 * browser download link), retina-sharp via devicePixelRatio-aware scaling.
 * The whole viewport becomes the book: swipe left/right to turn pages (choice
 * of fade/curl/slide/instant transitions), pinch or double-tap to zoom, drag
 * to pan while zoomed.
 */
export default function PdfReader({ book, uid, onProgress, onClose }) {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const [pdf, setPdf] = useState(null)
  const [pageNum, setPageNum] = useState(Math.max(1, book.current_page || 1))
  const [numPages, setNumPages] = useState(book.total_pages || 0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [turning, setTurning] = useState(null) // { dir, phase: 'exit'|'enterJump'|'enter' } | null
  const [jump, setJump] = useState(false) // true = apply style instantly, no transition
  const [effect, setEffect] = useState('fade')
  const [showEffectMenu, setShowEffectMenu] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)
  const [savedNote, setSavedNote] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const touch = useRef({}) // scratch state for gesture tracking, doesn't need to trigger renders

  // load the document via a fresh signed URL (bucket is private)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setErr('')
    if (!book.file_path) {
      setErr('This file was uploaded before file storage was fixed and can no longer be located. Please remove it and re-upload — sorry for the inconvenience.')
      setLoading(false)
      return
    }
    supabase.storage.from('ebooks').createSignedUrl(book.file_path, 3600).then(async ({ data, error }) => {
      if (error) { if (!cancelled) setErr('Could not get file access: ' + error.message); return }
      if (!data?.signedUrl) { if (!cancelled) setErr(`Storage returned no signed URL for path "${book.file_path}". The file may not exist at that location.`); return }
      try {
        const doc = await pdfjsLib.getDocument({ url: data.signedUrl }).promise
        if (cancelled) return
        setPdf(doc)
        setNumPages(doc.numPages)
        if (!book.total_pages) {
          await supabase.from('ebooks').update({ total_pages: doc.numPages }).eq('id', book.id)
        }
      } catch (e) {
        if (!cancelled) setErr('Could not open this file: ' + e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [book.file_path]) // eslint-disable-line

  const [resizeTick, setResizeTick] = useState(0)
  useEffect(() => {
    const onResize = () => setResizeTick(t => t + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // render current page — sized to the actual on-screen stage (not the canvas's
  // own shrink-wrapped parent, which was the bug: the flip wrapper div has no
  // fixed width, so it was measuring the canvas's stale/default size instead of
  // real screen space, producing a tiny page with huge dead space around it.
  // Fits within BOTH width and height of the stage, and renders at devicePixelRatio
  // for genuinely sharp (not just upscaled) text on high-density phone screens.
  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    pdf.getPage(pageNum).then(async page => {
      if (cancelled) return
      const canvas = canvasRef.current
      const stage = stageRef.current
      if (!canvas || !stage) return
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const pad = 24 // breathing room from stage edges, px
      const availW = stage.clientWidth - pad * 2
      const availH = stage.clientHeight - pad * 2
      const baseViewport = page.getViewport({ scale: 1 })
      // Fit to the full available HEIGHT (not "contain" within both dimensions) —
      // this is why there was dead space above/below the page even after the
      // earlier sizing fix: this PDF's pages are proportionally wider than a
      // phone screen, so fitting both dimensions left height unused. Filling
      // height edge-to-edge reads far more like an actual book; if that makes
      // the page slightly wider than the screen, the stage's overflow:hidden
      // crops a sliver of outer margin evenly on both sides — never the text.
      const fitScale = (() => {
        let s = availH / baseViewport.height
        // Guard against pathological cases (e.g. a landscape-oriented PDF) where
        // height-fit would crop way more than just outer margins — fall back to
        // width-fit rather than slicing off real content.
        if (baseViewport.width * s > availW * 1.4) s = availW / baseViewport.width
        return s
      })()
      const viewport = page.getViewport({ scale: fitScale * dpr })
      const ctx = canvas.getContext('2d')
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = (viewport.width / dpr) + 'px'
      canvas.style.height = (viewport.height / dpr) + 'px'
      await page.render({ canvasContext: ctx, viewport }).promise
    })
    supabase.from('ebook_highlights').select('id, note').eq('ebook_id', book.id).eq('page', pageNum).limit(1)
      .then(({ data }) => {
        setBookmarked(!!data?.length)
        setSavedNote(data?.[0]?.note || '')
      })
    return () => { cancelled = true }
  }, [pdf, pageNum, resizeTick]) // eslint-disable-line

  const goTo = (n, dir) => {
    if (n < 1 || n > numPages || turning) return
    if (zoom > 1.02) resetZoom() // page buttons should always work — reset any zoom/pan for the new page

    if (effect === 'instant') {
      setPageNum(n)
      onProgress?.(n)
      return
    }

    const ms = effectMs(effect)
    setTurning({ dir, phase: 'exit' })
    setTimeout(() => {
      setPageNum(n)
      onProgress?.(n)
      setJump(true) // apply the entry starting position with no transition...
      setTurning({ dir, phase: 'enterJump' })
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setJump(false) // ...then let it animate from there to settled
        setTurning({ dir, phase: 'enter' })
        setTimeout(() => setTurning(null), ms + 20)
      }))
    }, ms)
  }

  const toggleBookmark = async () => {
    if (bookmarked) {
      await supabase.from('ebook_highlights').delete().eq('ebook_id', book.id).eq('page', pageNum)
      setBookmarked(false)
    } else {
      await supabase.from('ebook_highlights').insert({
        user_id: uid, ebook_id: book.id, page: pageNum, quote: `Bookmark — page ${pageNum}`,
      })
      setBookmarked(true)
    }
  }

  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  // --- Touch gestures: pinch-zoom, double-tap-zoom, drag-to-pan, swipe-to-turn ---
  const dist = (t0, t1) => Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)

  const onTouchStart = e => {
    if (e.touches.length === 2) {
      touch.current = {
        mode: 'pinch',
        startDist: dist(e.touches[0], e.touches[1]),
        startZoom: zoom,
      }
    } else if (e.touches.length === 1) {
      const now = Date.now()
      const t = e.touches[0]
      const isDoubleTap = touch.current.lastTap && now - touch.current.lastTap < DOUBLE_TAP_MS
      touch.current = {
        mode: zoom > 1.02 ? 'pan' : 'swipe',
        startX: t.clientX, startY: t.clientY,
        startPan: pan, lastTap: isDoubleTap ? null : now,
      }
      if (isDoubleTap) {
        zoom > 1.02 ? resetZoom() : setZoom(DOUBLE_TAP_ZOOM)
        touch.current.mode = 'none'
      }
    }
  }

  const onTouchMove = e => {
    const m = touch.current
    if (m.mode === 'pinch' && e.touches.length === 2) {
      const scale = dist(e.touches[0], e.touches[1]) / m.startDist
      setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, m.startZoom * scale)))
    } else if (m.mode === 'pan' && e.touches.length === 1) {
      const t = e.touches[0]
      setPan({ x: m.startPan.x + (t.clientX - m.startX), y: m.startPan.y + (t.clientY - m.startY) })
    }
    // 'swipe' mode: no live tracking needed, decided on touchend below
  }

  const onTouchEnd = e => {
    const m = touch.current
    if (m.mode === 'swipe' && e.changedTouches?.length === 1) {
      const dx = e.changedTouches[0].clientX - m.startX
      const dy = e.changedTouches[0].clientY - m.startY
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) goTo(pageNum + 1, 'next')
        else goTo(pageNum - 1, 'prev')
      }
    }
    if (zoom < 1.05) resetZoom()
    touch.current = {}
  }

  // Resolve the wrapper's current style from the turning state machine.
  const turnStyle = (() => {
    if (!turning) return settledStyle
    if (turning.phase === 'exit') return exitStyle(effect, turning.dir)
    if (turning.phase === 'enterJump') return enterStartStyle(effect, turning.dir)
    return settledStyle // phase === 'enter' — animates from the jumped position to settled
  })()

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 800, background: '#060913',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Toolbar */}
      <div className="row between" style={{ padding: 'calc(0.8rem + env(safe-area-inset-top)) 1rem 0.8rem', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <button className="btn-ghost" onClick={onClose}>✕</button>
        <span className="item-title" style={{ fontWeight: 600, flex: 1, textAlign: 'center', margin: '0 0.6rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {book.title}
        </span>
        <button
          onClick={toggleBookmark}
          title={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
          className="btn-ghost"
          style={{ color: bookmarked ? 'var(--accent, #7c9fff)' : undefined }}
        >
          {bookmarked ? '★' : '☆'}
        </button>
        <div style={{ position: 'relative' }}>
          <button className="btn-ghost" onClick={() => setShowEffectMenu(v => !v)} title="Page-turn effect">⇄</button>
          {showEffectMenu && (
            <div style={{
              position: 'absolute', top: '110%', right: 0, zIndex: 5,
              background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10,
              padding: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 110,
            }}>
              {EFFECTS.map(o => (
                <button
                  key={o.id}
                  className="btn-ghost"
                  style={{ justifyContent: 'flex-start', color: effect === o.id ? 'var(--accent, #7c9fff)' : undefined }}
                  onClick={() => { setEffect(o.id); setShowEffectMenu(false) }}
                >
                  {effect === o.id ? '✓ ' : ''}{o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {err && <div className="auth-err" style={{ margin: '1rem' }}>{err}</div>}
      {loading && !err && <div className="empty" style={{ margin: 'auto' }}>Opening…</div>}

      {!loading && !err && (
        <>
          {/* Page stage — fills remaining screen, handles all touch gestures */}
          <div
            ref={stageRef}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
              flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              perspective: 1400, touchAction: 'none',
            }}
          >
            <div style={{
              transition: jump ? 'none' : `transform ${effectMs(effect)}ms ${TURN_EASE}, opacity ${effectMs(effect)}ms ${TURN_EASE}`,
              ...turnStyle,
            }}>
              <canvas
                ref={canvasRef}
                style={{
                  display: 'block', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transition: touch.current.mode === 'pan' || touch.current.mode === 'pinch' ? 'none' : 'transform 150ms ease',
                }}
              />
            </div>

            {/* Edge tap zones — fallback for people who don't swipe */}
            {zoom <= 1.02 && (
              <>
                <button
                  onClick={() => goTo(pageNum - 1, 'prev')}
                  disabled={pageNum <= 1 || !!turning}
                  aria-label="Previous page"
                  style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '18%', background: 'none', border: 'none', opacity: 0 }}
                />
                <button
                  onClick={() => goTo(pageNum + 1, 'next')}
                  disabled={pageNum >= numPages || !!turning}
                  aria-label="Next page"
                  style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '18%', background: 'none', border: 'none', opacity: 0 }}
                />
              </>
            )}
          </div>

          {/* Bottom bar */}
          <div className="row between" style={{ padding: '0.7rem 1rem calc(0.7rem + env(safe-area-inset-bottom))', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
            <button className="btn-ghost" disabled={pageNum <= 1 || !!turning} onClick={() => goTo(pageNum - 1, 'prev')}>← Prev</button>
            <span className="hud">PAGE {pageNum} / {numPages || '?'}{zoom > 1.02 ? ` · ${zoom.toFixed(1)}×` : ''}</span>
            <button className="btn-ghost" disabled={pageNum >= numPages || !!turning} onClick={() => goTo(pageNum + 1, 'next')}>Next →</button>
          </div>
          {bookmarked && savedNote && (
            <div className="item-sub" style={{ padding: '0 1rem 0.6rem', flexShrink: 0 }}>{savedNote}</div>
          )}
        </>
      )}
    </div>
  )
}
