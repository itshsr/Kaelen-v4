import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
export const DEFAULT_CATS = ['Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Other']
export const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

export function useUid() {
  const [uid, setUid] = useState(null)
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data.user?.id)) }, [])
  return uid
}
