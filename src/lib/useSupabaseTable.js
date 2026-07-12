import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

/**
 * Replaces the hand-copied "load() + err state + CRUD" pattern that was
 * duplicated across Forge, Grimoire, Vault, and User (9+ near-identical
 * instances). One hook, one place to fix bugs in this pattern going forward.
 *
 * Usage:
 *   const { rows, err, reload, insert, update, remove } = useSupabaseTable('notes', {
 *     orderBy: { column: 'updated_at', ascending: false },
 *     enabled: !!uid,
 *   })
 */
export function useSupabaseTable(table, { orderBy, filter, enabled = true } = {}) {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!enabled) return
    setErr('')
    let q = supabase.from(table).select('*')
    if (filter) q = filter(q)
    if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true })
    const { data, error } = await q
    if (error) setErr(error.message)
    setRows(data || [])
    setLoading(false)
  }, [table, enabled]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  const insert = async payload => {
    setErr('')
    const { error, data } = await supabase.from(table).insert(payload).select()
    if (error) { setErr(error.message); return { error } }
    await load()
    return { data: data?.[0] }
  }

  const update = async (id, payload) => {
    setErr('')
    const { error } = await supabase.from(table).update(payload).eq('id', id)
    if (error) { setErr(error.message); return { error } }
    await load()
    return {}
  }

  const remove = async id => {
    setErr('')
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) { setErr(error.message); return { error } }
    await load()
    return {}
  }

  return { rows, err, loading, reload: load, insert, update, remove }
}
