// supabase/functions/morning-brief/index.ts
// Daily morning brief email — 7am AEST (21:00 UTC)
// Now includes inbox items alongside tasks and bills
// Deploy: supabase functions deploy morning-brief

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  try {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", requestId }), { status: 405, headers: { "Content-Type": "application/json", "Allow": "POST" } });
    }
    const SUPABASE_URL = requiredEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");
    if (authorization !== `Bearer ${SUPABASE_SERVICE_KEY}`) {
      return new Response(JSON.stringify({ error: "Unauthorized", requestId }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    const RESEND_API_KEY = requiredEnv("RESEND_API_KEY");
    const USER_ID = requiredEnv("TOWNSEND_USER_ID");
    const TO_EMAIL = requiredEnv("BRIEF_TO_EMAIL");
    const FROM_EMAIL = requiredEnv("BRIEF_FROM_EMAIL");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Fetch tasks, bills, and inbox ──
    const [taskResult, billResult, inboxResult] = await Promise.all([
      supabase.from("tasks").select("*").eq("user_id", USER_ID).eq("done", false).order("id"),
      supabase.from("bills").select("*").eq("user_id", USER_ID).order("id"),
      supabase.from("inbox_items").select("*").eq("user_id", USER_ID).eq("archived", false).order("priority").order("id"),
    ]);

    if (taskResult.error || billResult.error || inboxResult.error) throw new Error("Failed to fetch brief data");
    const tasks = taskResult.data ?? [];
    const bills = billResult.data ?? [];
    const inboxItems = inboxResult.data ?? [];

    const now = new Date();
    const aest = new Date(now.toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
    const dateStr = aest.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const today = new Date(aest.getFullYear(), aest.getMonth(), aest.getDate());

    // ── Categorise tasks ──
    const getDate = (due: any): Date | null => {
      if (!due) return null;
      if (due.type === "today") return today;
      if (due.type === "tomorrow") { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }
      if (due.type === "week") { const d = new Date(today); d.setDate(d.getDate() + (7 - d.getDay())); return d; }
      if (due.type === "month") return new Date(today.getFullYear(), today.getMonth() + 1, 0);
      if (due.type === "custom" && due.date) return new Date(due.date + "T00:00:00");
      return null;
    };

    const urgent = tasks.filter((t: any) => t.urgent);
    const overdue = tasks.filter((t: any) => {
      const d = getDate(t.due);
      return d && d < today && !t.urgent;
    });
    const dueToday = tasks.filter((t: any) => {
      const d = getDate(t.due);
      return d && d.getTime() === today.getTime() && !t.urgent;
    });
    const dueTomorrow = tasks.filter((t: any) => {
      const d = getDate(t.due);
      const tmrw = new Date(today); tmrw.setDate(tmrw.getDate() + 1);
      return d && d.getTime() === tmrw.getTime() && !t.urgent;
    });
    const highPriority = tasks.filter((t: any) =>
      t.priority === "high" && !t.urgent &&
      !overdue.includes(t) && !dueToday.includes(t) && !dueTomorrow.includes(t)
    );

    // ── Bill alerts (due within 3 days) ──
    const billAlerts: string[] = [];
    if (bills) {
      for (const b of bills) {
        if (b.freq === "Monthly") {
          const diff = b.day - aest.getDate();
          if (diff >= 0 && diff <= 3) billAlerts.push(`${escapeHtml(b.name)} — $${escapeHtml(b.amount)} due in ${diff === 0 ? "today" : diff + "d"}`);
        } else if (b.freq === "Weekly") {
          const dayOfWeek = aest.getDay();
          const diff = (b.day - dayOfWeek + 7) % 7;
          if (diff <= 3) billAlerts.push(`${escapeHtml(b.name)} — $${escapeHtml(b.amount)} due in ${diff === 0 ? "today" : diff + "d"}`);
        }
      }
    }

    // ── Inbox summary ──
    const inboxMessages = (inboxItems || []).filter((i: any) => i.item_type === "message");
    const inboxEmails = (inboxItems || []).filter((i: any) => i.item_type === "email");
    const urgentMessages = inboxMessages.filter((i: any) => i.priority === 1);
    const urgentEmails = inboxEmails.filter((i: any) => i.priority === 1);
    const reviewEmails = inboxEmails.filter((i: any) => i.priority === 2);

    // ── Suggested daily program ──
    const program: string[] = [];
    if (urgent.length || overdue.length || dueToday.length) {
      program.push("<strong>Morning:</strong> Clear urgent + overdue items first");
      const morningItems = [...urgent, ...overdue, ...dueToday].slice(0, 3);
      morningItems.forEach((t: any) => program.push(`&nbsp;&nbsp;→ ${escapeHtml(t.name)}`));
    }
    if (urgentMessages.length || urgentEmails.length) {
      program.push("<strong>Comms:</strong> Reply to outstanding messages");
      urgentMessages.forEach((m: any) => program.push(`&nbsp;&nbsp;→ ${escapeHtml(m.sender)} (${escapeHtml(m.platform)}) — ${escapeHtml(m.flag)}`));
      urgentEmails.slice(0, 2).forEach((e: any) => program.push(`&nbsp;&nbsp;→ ${escapeHtml(e.sender)} — ${escapeHtml(e.subject)}`));
    }
    if (highPriority.length) {
      program.push("<strong>Afternoon:</strong> Chip away at high-priority items");
      highPriority.slice(0, 3).forEach((t: any) => program.push(`&nbsp;&nbsp;→ ${escapeHtml(t.name)} (${escapeHtml(t.cat)})`));
    }

    // ── Open tasks by category ──
    const catCounts: Record<string, number> = {};
    tasks.forEach((t: any) => { catCounts[t.cat] = (catCounts[t.cat] || 0) + 1; });
    const catSummary = Object.entries(catCounts).map(([c, n]) => `${escapeHtml(c)}: ${n}`).join(" · ");

    // ── HTML builder ──
    const section = (title: string, color: string, items: any[]) => {
      if (!items.length) return "";
      return `<div style="margin-bottom:14px">
        <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:6px">${title}</div>
        ${items.map((t: any) => {
          const d = getDate(t.due);
          const dateLabel = d ? ` — ${d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : "";
          return `<div style="font-size:13px;color:#1a1a1a;margin-bottom:3px;padding-left:8px">• ${escapeHtml(t.name)} <span style="color:#999;font-size:11px">(${escapeHtml(t.cat)}${dateLabel})</span></div>`;
        }).join("")}
      </div>`;
    };

    const inboxSection = (title: string, color: string, items: any[], showSubject: boolean) => {
      if (!items.length) return "";
      return `<div style="margin-bottom:10px">
        <div style="font-size:12px;font-weight:700;color:${color};margin-bottom:4px">${title}</div>
        ${items.map((i: any) => {
          const label = showSubject && i.subject ? i.subject : i.content;
          const truncated = label.length > 80 ? label.slice(0, 80) + "..." : label;
          return `<div style="font-size:12px;color:#1a1a1a;margin-bottom:3px;padding-left:8px">• <strong>${escapeHtml(i.sender)}</strong>${i.platform ? ` (${escapeHtml(i.platform)})` : ""} — ${escapeHtml(truncated)} <span style="color:#647581;font-size:10px;font-weight:600">[${escapeHtml(i.flag)}]</span></div>`;
        }).join("")}
      </div>`;
    };

    // ── Compose email HTML ──
    const needsAttention = urgent.length + dueToday.length + urgentMessages.length + urgentEmails.length;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif">
  <div style="max-width:520px;margin:20px auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb">

    <div style="text-align:center;margin-bottom:18px">
      <div style="font-size:20px;font-weight:800;color:#1a1a1a;letter-spacing:-0.5px">Townsend OS</div>
      <div style="font-size:12px;color:#999;margin-top:2px">${dateStr}</div>
    </div>

    <!-- Summary chips -->
    <div style="display:flex;gap:8px;margin-bottom:16px;justify-content:center;flex-wrap:wrap">
      <span style="background:#fef2f2;color:#dc2626;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px">${urgent.length + overdue.length} urgent/overdue</span>
      <span style="background:#fffbeb;color:#d97706;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px">${dueToday.length} due today</span>
      <span style="background:#f3f4f6;color:#6b7280;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px">${tasks.length} open tasks</span>
      <span style="background:#e8f4fd;color:#1a6fa0;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px">${urgentMessages.length + urgentEmails.length} inbox action</span>
    </div>

    ${billAlerts.length ? `
    <!-- Bill Alerts -->
    <div style="background:#fff9e6;border:1.5px solid #dfc44a;border-radius:10px;padding:14px 16px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:#b8860b;margin-bottom:8px">Bill Reminders</div>
      ${billAlerts.map(b => `<div style="font-size:13px;color:#1a1a1a;margin-bottom:4px">• ${b}</div>`).join("")}
    </div>` : ""}

    ${program.length ? `
    <!-- Daily Program -->
    <div style="background:#e8f4fd;border:1.5px solid #7cb8db;border-radius:10px;padding:14px 16px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:#1a6fa0;margin-bottom:10px">Suggested Daily Program</div>
      <div style="font-size:13px;color:#1a1a1a;line-height:1.7">${program.join("<br>")}</div>
    </div>` : ""}

    <!-- Task Sections -->
    ${section("Urgent", "#dc2626", urgent)}
    ${section("Overdue", "#b91c1c", overdue)}
    ${section("Due Today", "#d97706", dueToday)}
    ${section("Due Tomorrow", "#ca8a04", dueTomorrow)}
    ${section("High Priority", "#b8860b", highPriority)}

    ${(urgentMessages.length || urgentEmails.length || reviewEmails.length) ? `
    <!-- Inbox Section -->
    <div style="background:#fdf8f0;border:1.5px solid #e8d5b0;border-radius:10px;padding:14px 16px;margin-bottom:16px;margin-top:16px">
      <div style="font-size:13px;font-weight:700;color:#b8860b;margin-bottom:10px">Inbox — Needs Attention</div>
      ${inboxSection("Messages — Reply owed", "#dc2626", urgentMessages, false)}
      ${inboxSection("Email — Action required", "#dc2626", urgentEmails, true)}
      ${inboxSection("Email — Worth a look", "#d97706", reviewEmails, true)}
      <div style="font-size:11px;color:#999;margin-top:6px">${inboxMessages.length} messages · ${inboxEmails.length} emails total (${inboxMessages.length + inboxEmails.length - urgentMessages.length - urgentEmails.length - reviewEmails.length} low priority hidden)</div>
    </div>` : ""}

    <!-- Open by category -->
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-top:20px">
      <div style="font-size:13px;font-weight:700;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em">Open Tasks by Category</div>
      <div style="font-size:13px;color:#1a1a1a;line-height:1.8">${catSummary}</div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:20px;font-size:12px;color:#999">
      Townsend OS · Sent automatically at 7am AEST<br>
      <a href="https://townsend-os.com" style="color:#b8860b">Open Townsend OS &rarr;</a>
    </div>

  </div>
</body>
</html>`;

    // ── Send via Resend ──
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        subject: `Townsend OS — ${dateStr} · ${tasks.length} open, ${needsAttention} need attention`,
        html,
      }),
    });

    const resBody = await res.json();
    if (!res.ok) throw new Error(`Resend error: ${JSON.stringify(resBody)}`);

    return new Response(JSON.stringify({ success: true, emailId: resBody.id }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("morning-brief failed", { requestId, error: err instanceof Error ? err.message : "Unknown error" });
    return new Response(JSON.stringify({ error: "Unable to generate the morning brief", requestId }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
