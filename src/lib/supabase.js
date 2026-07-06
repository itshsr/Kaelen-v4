import { createClient } from '@supabase/supabase-js'

const url = 'https://tiumyzsdclgawbbbtowy.supabase.co'
const key = 'sb_publishable_79wleFmsfIubmDQNThJcKw_6YlrgxJB'

export const supabase = createClient(url, key)
