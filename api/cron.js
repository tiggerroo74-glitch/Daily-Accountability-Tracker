import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase environment variables.");
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY environment variable.");
  }
  return new Resend(process.env.RESEND_API_KEY);
}

function esc(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabase();
    const resend = getResend();
    const from = process.env.REMINDER_FROM_EMAIL || "Accountability Tracker <onboarding@resend.dev>";
    const now = new Date().toISOString();

    const { data: tasks, error } = await supabase
      .from("accountability_tasks")
      .select("*")
      .neq("status", "Complete")
      .eq("reminder_sent", false)
      .lte("due_at", now)
      .limit(25);

    if (error) throw error;

    if (!tasks || tasks.length === 0) {
      return res.status(200).json({ ok: true, message: "No reminders due.", remindersSent: 0 });
    }

    for (const task of tasks) {
      await resend.emails.send({
        from,
        to: task.reminder_email,
        subject: `Reminder: ${task.task_name}`,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:620px">
            <h2>Accountability Reminder</h2>
            <p><strong>Task:</strong> ${esc(task.task_name)}</p>
            <p><strong>Due:</strong> ${esc(new Date(task.due_at).toLocaleString("en-US", { timeZone: "America/Chicago" }))}</p>
            <p><strong>Priority:</strong> ${esc(task.priority)}</p>
            <p><strong>Category:</strong> ${esc(task.category)}</p>
            ${task.why ? `<p><strong>Why it matters:</strong> ${esc(task.why)}</p>` : ""}
            ${task.notes ? `<p><strong>Notes:</strong> ${esc(task.notes)}</p>` : ""}
            <p>This task is due and has not been marked complete.</p>
          </div>
        `
      });

      await supabase
        .from("accountability_tasks")
        .update({ reminder_sent: true })
        .eq("id", task.id);
    }

    return res.status(200).json({ ok: true, remindersSent: tasks.length });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
