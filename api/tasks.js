import { createClient } from "@supabase/supabase-js";

const TABLE_NAME = "accountability_tasks";

function env(nameList) {
  for (const name of nameList) {
    const value = process.env[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function cleanSupabaseUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl.trim());
    // Vercel env vars sometimes get pasted as a full REST endpoint.
    // Supabase client needs only the project root: https://xxxx.supabase.co
    return parsed.origin;
  } catch {
    return rawUrl.trim().replace(/\/+$/, "");
  }
}

function getSupabase() {
  const supabaseUrl = cleanSupabaseUrl(env(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]));
  const serviceKey = env(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY"]);

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing Supabase environment variables. Required in Vercel Production: SUPABASE_URL as the project root URL and SUPABASE_SERVICE_ROLE_KEY as the service-role key."
    );
  }

  if (!/^https:\/\/[^/]+\.supabase\.co$/i.test(supabaseUrl)) {
    throw new Error(
      "SUPABASE_URL should look like https://your-project.supabase.co. Do not paste a /rest/v1 URL, table URL, anon key, or SQL connection string."
    );
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function normalizeTask(body = {}) {
  const taskName = String(body.taskName || body.task_name || body.title || "").trim();
  const notes = String(body.notes || body.description || "");
  const reminderEmail = String(body.reminderEmail || body.reminder_email || "").trim();

  // Keep this payload aligned to the accountability_tasks table columns only.
  // Extra keys like title/description caused Supabase inserts to fail when those columns were not present.
  return {
    task_name: taskName,
    due_at: body.dueAt || body.due_at || null,
    time_needed: body.timeNeeded || body.time_needed || "",
    priority: body.priority || "Medium",
    category: body.category || "Personal",
    status: body.status || "Not Started",
    why: body.why || "",
    notes,
    reminder_email: reminderEmail,
    completed_at: body.completedAt || body.completed_at || null,
    snoozed_at: body.snoozedAt || body.snoozed_at || null,
    snooze_label: body.snoozeLabel || body.snooze_label || "",
    reminder_sent: Boolean(body.reminderSent || body.reminder_sent || false)
  };
}

function toClient(row) {
  const due = row.due_at ? new Date(row.due_at) : null;
  const validDue = due && !Number.isNaN(due.getTime());

  return {
    id: row.id,
    taskName: row.task_name || row.title || "",
    dueAt: row.due_at || "",
    dueDate: validDue ? due.toISOString().slice(0, 10) : "",
    dueTime: validDue ? due.toISOString().slice(11, 16) : "",
    timeNeeded: row.time_needed || "",
    priority: row.priority || "Medium",
    category: row.category || "Personal",
    status: row.status || "Not Started",
    why: row.why || "",
    notes: row.notes || row.description || "",
    reminderEmail: row.reminder_email || "",
    reminderSent: row.reminder_sent || false,
    createdAt: row.created_at || "",
    completedAt: row.completed_at || "",
    snoozedAt: row.snoozed_at || "",
    snoozeLabel: row.snooze_label || ""
  };
}

function apiError(err) {
  const raw = err?.message || String(err);
  if (raw === "TypeError: fetch failed" || raw.includes("fetch failed")) {
    return "Supabase connection failed from Vercel. Most likely SUPABASE_URL is not the project root URL or the service-role key/env vars need to be re-saved in Vercel Production, then redeployed.";
  }
  return raw;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  try {
    const supabase = getSupabase();

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select("*")
        .order("due_at", { ascending: true });

      if (error) throw error;
      return res.status(200).json({ ok: true, tasks: (data || []).map(toClient) });
    }

    if (req.method === "POST") {
      const task = normalizeTask(req.body);

      if (!task.task_name || !task.due_at || !task.reminder_email) {
        return res.status(400).json({ ok: false, error: "Task, due date/time, and reminder email are required." });
      }

      const { data, error } = await supabase
        .from(TABLE_NAME)
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
        .from(TABLE_NAME)
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

      const { error } = await supabase.from(TABLE_NAME).delete().eq("id", id);
      if (error) throw error;

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: apiError(err) });
  }
}
