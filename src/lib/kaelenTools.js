import { supabase } from './supabase'

// KAELEN tool definitions for Gemini function calling (CORE chat).
//
// Read tools (no `write` flag) only ever SELECT, scoped to the signed-in user via
// existing RLS policies (uid is passed in for filtering, but RLS is the real
// backstop). These run automatically inside the model's tool-calling loop.
//
// Write tools (`write: true`, added in Phase 2) propose a change — add a task,
// log an expense, mark a habit done, toggle a task. geminiChat() never runs
// their `execute()` itself; it stops the moment one is called and hands it back
// to Core.jsx as a pendingAction. `execute()` only runs after the user taps
// Confirm on the on-screen card. No write ever happens without that tap.

const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
const today = () => new Date().toISOString().slice(0, 10)

async function getTasks(uid, { status } = {}) {
  let q = supabase.from('tasks').select('title, completed, due_date, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(50)
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

async function getCards(uid) {
  const [{ data: cards, error }, { data: expenses }] = await Promise.all([
    supabase.from('credit_cards').select('id, label, credit_limit, opening_balance').eq('user_id', uid),
    supabase.from('expenses').select('card_id, amount').eq('user_id', uid).not('card_id', 'is', null),
  ])
  if (error) return { error: error.message }
  const spentByCard = {}
  ;(expenses || []).forEach(e => { spentByCard[e.card_id] = (spentByCard[e.card_id] || 0) + Number(e.amount) })
  return {
    cards: (cards || []).map(c => {
      const spent = Number(c.opening_balance || 0) + (spentByCard[c.id] || 0)
      const limit = Number(c.credit_limit || 0)
      return {
        name: c.label, limit: limit || null, spent,
        available: limit > 0 ? Math.max(limit - spent, 0) : null,
      }
    }),
    currency: 'INR',
  }
}

async function markHabitDone(uid, { habit_name }) {
  const { data: matches, error } = await supabase.from('habits')
    .select('id, name').eq('user_id', uid).ilike('name', habit_name?.trim() || '')
  if (error) return { error: error.message }
  if (!matches?.length) return { error: `No habit named "${habit_name}" found.` }
  if (matches.length > 1) return { error: `Multiple habits match "${habit_name}" — ask the user to be more specific.` }
  const habit = matches[0]
  const day = today()
  const { data: existing } = await supabase.from('habit_completions')
    .select('id').eq('user_id', uid).eq('habit_id', habit.id).eq('completed_on', day).maybeSingle()
  if (existing) return { ok: true, already_done: true, habit: habit.name }
  const { error: insErr } = await supabase.from('habit_completions').insert({ user_id: uid, habit_id: habit.id, completed_on: day })
  if (insErr) return { error: insErr.message }
  return { ok: true, habit: habit.name }
}

async function addTask(uid, { title }) {
  const t = (title || '').trim()
  if (!t) return { error: 'Task title is empty.' }
  const { error } = await supabase.from('tasks').insert({ user_id: uid, title: t })
  if (error) return { error: error.message }
  return { ok: true, title: t }
}

async function toggleTaskComplete(uid, { task_title, completed }) {
  const { data: matches, error } = await supabase.from('tasks')
    .select('id, title, completed').eq('user_id', uid).ilike('title', task_title?.trim() || '')
  if (error) return { error: error.message }
  if (!matches?.length) return { error: `No task titled "${task_title}" found.` }
  if (matches.length > 1) return { error: `Multiple tasks match "${task_title}" — ask the user to be more specific.` }
  const done = completed !== false
  const { error: upErr } = await supabase.from('tasks').update({
    completed: done, completed_at: done ? new Date().toISOString() : null,
  }).eq('id', matches[0].id)
  if (upErr) return { error: upErr.message }
  return { ok: true, title: matches[0].title, completed: done }
}

async function addExpense(uid, { amount, category, note }) {
  const amt = Number(amount)
  if (!amt || amt <= 0) return { error: 'Amount must be a positive number.' }
  const { error } = await supabase.from('expenses').insert({
    user_id: uid, amount: amt, category: (category || 'Other').trim(),
    note: note?.trim() || null, payment_method: 'Cash', card_id: null, spent_on: today(),
  })
  if (error) return { error: error.message }
  return { ok: true, amount: amt, category: category || 'Other' }
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
    {
      name: 'get_cards',
      description: "Get the user's credit/debit cards from VAULT — name, limit, amount spent, and available balance for each. Amounts are in INR (₹).",
      parameters: { type: 'OBJECT', properties: {} },
      execute: () => getCards(uid),
    },
    // --- Phase 2: write tools. `write: true` means these are NEVER auto-executed by
    // geminiChat — calling one only proposes the action; execute() only runs after the
    // user taps Confirm in the UI (see Core.jsx). confirmLabel builds the human-readable
    // text shown on that confirmation card.
    {
      name: 'add_task',
      description: 'Propose adding a new task to FORGE. Requires user confirmation before it is created.',
      parameters: {
        type: 'OBJECT',
        properties: { title: { type: 'STRING', description: 'The task title' } },
        required: ['title'],
      },
      write: true,
      confirmLabel: args => `Add task: "${args.title}"`,
      execute: args => addTask(uid, args),
    },
    {
      name: 'toggle_task_complete',
      description: 'Propose marking an existing task done or not done. Match the task by its exact title. Requires user confirmation.',
      parameters: {
        type: 'OBJECT',
        properties: {
          task_title: { type: 'STRING', description: 'Exact title of the existing task' },
          completed: { type: 'BOOLEAN', description: 'true to mark done, false to mark not done. Defaults to true.' },
        },
        required: ['task_title'],
      },
      write: true,
      confirmLabel: args => `Mark task "${args.task_title}" as ${args.completed === false ? 'not done' : 'done'}`,
      execute: args => toggleTaskComplete(uid, args),
    },
    {
      name: 'mark_habit_done',
      description: "Propose marking one of the user's habits as done for today. Match by exact habit name. Requires user confirmation.",
      parameters: {
        type: 'OBJECT',
        properties: { habit_name: { type: 'STRING', description: "Exact name of the existing habit" } },
        required: ['habit_name'],
      },
      write: true,
      confirmLabel: args => `Mark habit "${args.habit_name}" as done today`,
      execute: args => markHabitDone(uid, args),
    },
    {
      name: 'add_expense',
      description: 'Propose logging a new expense in VAULT. Defaults to Cash as the payment method — the user can reassign it to a card afterward in the app. Requires user confirmation.',
      parameters: {
        type: 'OBJECT',
        properties: {
          amount: { type: 'NUMBER', description: 'Amount in INR (₹)' },
          category: { type: 'STRING', description: 'Expense category, e.g. Food, Bills, Transport' },
          note: { type: 'STRING', description: 'Optional short note' },
        },
        required: ['amount', 'category'],
      },
      write: true,
      confirmLabel: args => `Log ₹${args.amount} expense — ${args.category}${args.note ? ` (${args.note})` : ''}`,
      execute: args => addExpense(uid, args),
    },
  ]
}
