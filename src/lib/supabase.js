import { createClient } from '@supabase/supabase-js'

// Falls back to the current known-good values if env vars aren't set (e.g. on
// Vercel before VITE_SUPABASE_URL / VITE_SUPABASE_KEY are configured there) —
// nothing breaks if you don't set them, but setting them is the correct
// long-term home for this config instead of hardcoding.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://tiumyzsdclgawbbbtowy.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_79wleFmsfIubmDQNThJcKw_6YlrgxJB'

export const supabase = createClient(url, key)
