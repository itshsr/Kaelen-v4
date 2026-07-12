import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

/**
 * Real in-app PDF reader — pages are rendered to a canvas via pdf.js (not a
 * browser download link). Includes a page-turn slide transition and an
 * on-page bookmark button, replacing the earlier "Open file" external-link
 * approach entirely.
 */
export default function PdfReader({ book, uid, onProgress, onClose }) {
  const canvasRef = useRef(null)
  const [pdf, setPdf] = useState(null)
  const [pageNum, setPageNum] = useState(Math.max(1, book.current_page || 1))
  const [numPages, setNumPages] = useState(book.total_pages || 0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [turning, setTurning] = useState(null) // 'next' | 'prev' | null
  const [bookmarked, setBookmarked] = useState(false)
  const [savedNote, setSavedNote] = useState('')

  // load the document via a fresh signed URL (bucket is private)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setErr('')
    supabase.storage.from('ebooks').createSignedUrl(book.file_path, 3600).then(async ({ data, error }) => {
      if (error) { if (!cancelled) setErr(error.message); return }
      try {
        const doc = await pdfjsLib.getDocument(data.signedUrl).promise
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

  // render current page
  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    pdf.getPage(pageNum).then(async page => {
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return
      const containerWidth = canvas.parentElement.clientWidth
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(2, containerWidth / baseViewport.width)
      const viewport = page.getViewport({ scale })
      const ctx = canvas.getContext('2d')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: ctx, viewport }).promise
    })
    // check if this page is already bookmarked
    supabase.from('ebook_highlights').select('id, note').eq('ebook_id', book.id).eq('page', pageNum).limit(1)
      .then(({ data }) => {
        setBookmarked(!!data?.length)
        setSavedNote(data?.[0]?.note || '')
      })
    return () => { cancelled = true }
  }, [pdf, pageNum]) // eslint-disable-line

  const goTo = async (n, dir) => {
    if (n < 1 || n > numPages || turning) return
    setTurning(dir)
    setTimeout(() => {
      setPageNum(n)
      setTurning(null)
      onProgress?.(n)
    }, 180)
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

  return (
    <div className="panel" style={{ padding: '0.9rem' }}>
      <div className="row between" style={{ marginBottom: '0.7rem' }}>
        <span className="item-title" style={{ fontWeight: 600 }}>{book.title}</span>
        <button className="btn-ghost" onClick={onClose}>Back</button>
      </div>

      {err && <div className="auth-err">{err}</div>}
      {loading && !err && <div className="empty">Opening…</div>}

      {!loading && !err && (
        <>
          <div style={{
            position: 'relative', overflow: 'hidden', borderRadius: 10,
            background: 'var(--bg-2)', border: '1px solid var(--line)',
          }}>
            <canvas
              ref={canvasRef}
              style={{
                width: '100%', display: 'block',
                transition: 'transform 0.18s ease, opacity 0.18s ease',
                transform: turning === 'next' ? 'translateX(-6%)' : turning === 'prev' ? 'translateX(6%)' : 'translateX(0)',
                opacity: turning ? 0.4 : 1,
              }}
            />
            <button
              onClick={toggleBookmark}
              title={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
              style={{
                position: 'absolute', top: 10, right: 10, border: 'none', cursor: 'pointer',
                width: 34, height: 34, borderRadius: '50%',
                background: bookmarked ? 'var(--grad)' : 'rgba(10,14,26,0.6)',
                color: '#fff', fontSize: '1rem', backdropFilter: 'blur(6px)',
              }}
            >
              {bookmarked ? '★' : '☆'}
            </button>
          </div>

          <div className="row between" style={{ marginTop: '0.8rem' }}>
            <button className="btn-ghost" disabled={pageNum <= 1 || !!turning} onClick={() => goTo(pageNum - 1, 'prev')}>← Prev</button>
            <span className="hud">PAGE {pageNum} / {numPages || '?'}</span>
            <button className="btn-ghost" disabled={pageNum >= numPages || !!turning} onClick={() => goTo(pageNum + 1, 'next')}>Next →</button>
          </div>
          {bookmarked && savedNote && (
            <div className="item-sub" style={{ marginTop: '0.5rem' }}>{savedNote}</div>
          )}
        </>
      )}
    </div>
  )
}
