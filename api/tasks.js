import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase environment variables.");
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function normalizeTask(body = {}) {
  return {
    task_name: String(body.taskName || body.task_name || "").trim(),
    due_at: body.dueAt || body.due_at,
    time_needed: body.timeNeeded || body.time_needed || "",
    priority: body.priority || "Medium",
    category: body.category || "Personal",
    status: body.status || "Not Started",
    why: body.why || "",
    notes: body.notes || "",
    reminder_email: body.reminderEmail || body.reminder_email || "",
    completed_at: body.completedAt || body.completed_at || null,
    snoozed_at: body.snoozedAt || body.snoozed_at || null,
    snooze_label: body.snoozeLabel || body.snooze_label || "",
    reminder_sent: Boolean(body.reminderSent || body.reminder_sent || false)
  };
}

function toClient(row) {
  const due = new Date(row.due_at);
  return {
    id: row.id,
    taskName: row.task_name,
    dueAt: row.due_at,
    dueDate: due.toISOString().slice(0, 10),
    dueTime: due.toISOString().slice(11, 16),
    timeNeeded: row.time_needed || "",
    priority: row.priority || "Medium",
    category: row.category || "Personal",
    status: row.status || "Not Started",
    why: row.why || "",
    notes: row.notes || "",
    reminderEmail: row.reminder_email || "",
    reminderSent: row.reminder_sent || false,
    createdAt: row.created_at,
    completedAt: row.completed_at || "",
    snoozedAt: row.snoozed_at || "",
    snoozeLabel: row.snooze_label || ""
  };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  try {
    const supabase = getSupabase();

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("accountability_tasks")
        .select("*")
        .order("due_at", { ascending: true });
      if (error) throw error;
      return res.status(200).json({ ok: true, tasks: data.map(toClient) });
    }

    if (req.method === "POST") {
      const task = normalizeTask(req.body);
      if (!task.task_name || !task.due_at || !task.reminder_email) {
        return res.status(400).json({ ok: false, error: "Task, due date/time, and reminder email are required." });
      }
      const { data, error } = await supabase
        .from("accountability_tasks")
        .insert(task)
        .select("*")
        .single();
      if (error) throw error;
      return res.status(201).json({ ok: true, task: toClient(data) });
    }

    if (req.method === "PATCH") {
      const { id, ...body } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: "Task id is required." });
      const task = normalizeTask(body);
      if (task.status === "Complete" && !task.completed_at) task.completed_at = new Date().toISOString();
      if (task.status !== "Complete") task.completed_at = null;

      const { data, error } = await supabase
        .from("accountability_tasks")
        .update(task)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return res.status(200).json({ ok: true, task: toClient(data) });
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ ok: false, error: "Task id is required." });
      const { error } = await supabase.from("accountability_tasks").delete().eq("id", id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
