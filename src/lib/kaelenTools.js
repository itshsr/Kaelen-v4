import { supabase } from './supabase'

// Phase 1 — READ-ONLY tools for KAELEN (CORE chat).
// Every executor here only ever SELECTs, scoped to the signed-in user via
// existing RLS policies (uid is passed in for filtering, but RLS is the real
// backstop). None of these write, update, or delete anything — that's Phase 2,
// not built yet, and every write will require an explicit on-screen confirm
// before it ever ships. Keep it that way.

const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
const today = () => new Date().toISOString().slice(0, 10)

async function getTasks(uid, { status } = {}) {
  let q = supabase.from('tasks').select('title, completed, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(50)
  if (status === 'open') q = q.eq('completed', false)
  if (status === 'done') q = q.eq('completed', true)
  const { data, error } = await q
  if (error) return { error: error.message }
  return { tasks: data }
}

async function getUpcomingDeadlines(uid) {
  const { data, error } = await supabase.from('projects')
    .select('name, status, deadline').eq('user_id', uid)
    .not('deadline', 'is', null).gte('deadline', today())
    .order('deadline', { ascending: true }).limit(20)
  if (error) return { error: error.message }
  return { projects: data }
}

async function getExpensesSummary(uid) {
  const { data, error } = await supabase.from('expenses')
    .select('amount, category, spent_on').eq('user_id', uid).gte('spent_on', monthStart())
  if (error) return { error: error.message }
  const total = (data || []).reduce((s, e) => s + Number(e.amount), 0)
  const byCategory = {}
  ;(data || []).forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount) })
  return { month_to_date_total: total, by_category: byCategory, currency: 'INR', count: data?.length || 0 }
}

async function getBudgetStatus(uid) {
  const [{ data: b }, { data: x, error }] = await Promise.all([
    supabase.from('budget_settings').select('monthly_cap').eq('user_id', uid).single(),
    supabase.from('expenses').select('amount').eq('user_id', uid).gte('spent_on', monthStart()),
  ])
  if (error) return { error: error.message }
  const cap = Number(b?.monthly_cap || 0)
  const spent = (x || []).reduce((s, e) => s + Number(e.amount), 0)
  return {
    monthly_cap: cap || null,
    spent_this_month: spent,
    remaining: cap > 0 ? Math.max(cap - spent, 0) : null,
    over_budget: cap > 0 && spent > cap,
    currency: 'INR',
  }
}

async function getHabitsStatus(uid) {
  const t = today()
  const { data: habits, error } = await supabase.from('habits').select('id, name').eq('user_id', uid)
  if (error) return { error: error.message }
  const { data: doneRows } = await supabase.from('habit_completions')
    .select('habit_id').eq('user_id', uid).eq('completed_on', t)
  const doneIds = new Set((doneRows || []).map(r => r.habit_id))
  return {
    habits: (habits || []).map(h => ({ name: h.name, done_today: doneIds.has(h.id) })),
  }
}

// Gemini function-declaration schemas paired with their local executor.
// `execute` closes over uid so Core.jsx doesn't need to thread it through Gemini args.
export function buildKaelenTools(uid) {
  return [
    {
      name: 'get_tasks',
      description: "Get the user's tasks from the FORGE tasks list. Use for questions about task status, open tasks, or completed tasks.",
      parameters: {
        type: 'OBJECT',
        properties: {
          status: { type: 'STRING', enum: ['open', 'done', 'all'], description: 'Filter by status. Defaults to all.' },
        },
      },
      execute: args => getTasks(uid, args),
    },
    {
      name: 'get_upcoming_deadlines',
      description: "Get the user's upcoming project deadlines from FORGE, soonest first.",
      parameters: { type: 'OBJECT', properties: {} },
      execute: () => getUpcomingDeadlines(uid),
    },
    {
      name: 'get_expenses_summary',
      description: "Get a summary of the user's spending this calendar month from VAULT — total and breakdown by category. Amounts are in INR (₹).",
      parameters: { type: 'OBJECT', properties: {} },
      execute: () => getExpensesSummary(uid),
    },
    {
      name: 'get_budget_status',
      description: "Get the user's monthly budget cap, amount spent so far this month, and remaining budget from VAULT. Amounts are in INR (₹).",
      parameters: { type: 'OBJECT', properties: {} },
      execute: () => getBudgetStatus(uid),
    },
    {
      name: 'get_habits_status',
      description: "Get the user's habits from GRIMOIRE and whether each has been marked done today.",
      parameters: { type: 'OBJECT', properties: {} },
      execute: () => getHabitsStatus(uid),
    },
  ]
}
