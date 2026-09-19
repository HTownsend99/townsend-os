import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Analytics } from "@vercel/analytics/react";
import { supabase } from "./supabaseClient";
import { billDueLabel, dateForDue, dueLabel, formatAUD, ordinal, toLocalISODate } from "./dateUtils";
import { Icon } from "./Icon";
import { canonicalTaskCategory, canonicalizeTask, CATEGORY_COLOURS, TASK_CATEGORIES } from "./taskCategories";
import type { AppPage, Bill, CalendarEvent, CalendarSyncSettings, DueValue, InboxItem, InboxSyncStatus, Priority, Task, TaskView } from "./types";
import "./App.css";

const WealthPage = lazy(() => import("./WealthPage"));

const NAV: Array<{ id: AppPage; label: string; icon: Parameters<typeof Icon>[0]["name"] }> = [
  { id: "tasks", label: "Tasks", icon: "check-square" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "inbox", label: "Inbox", icon: "inbox" },
  { id: "bills", label: "Bills", icon: "credit-card" },
  { id: "wealth", label: "Wealth", icon: "bar-chart" },
];

const PREVIEW_TASKS: Task[] = [
  { id: 1, user_id: "preview", cat: "Admin", name: "Review the morning brief", done: false, priority: "high", priority_code: "P1", workflow_status: "open", due: { type: "today" }, urgent: true, external_id: "RAD-PREVIEW-001", next_action: "Review the priority items and choose the first concrete action.", evidence: "Confirmed", source: "Radar action register", last_checked: "2026-09-20" },
  { id: 2, user_id: "preview", cat: "Admin", name: "Prepare documents for Friday", done: false, priority: "medium", workflow_status: "waiting", due: { type: "tomorrow" }, urgent: false },
  { id: 3, user_id: "preview", cat: "Health", name: "Plan next week's training", done: false, priority: "low", due: null, urgent: false },
  { id: 4, user_id: "preview", cat: "Projects", name: "Outline the next quarterly goal", done: false, priority: "medium", workflow_status: "backlog", due: { type: "month" }, urgent: false },
  { id: 5, user_id: "preview", cat: "Admin", name: "Complete weekly review", done: true, priority: "high", due: { type: "today" }, urgent: false, completed_at: new Date().toISOString() },
];
const PREVIEW_BILLS: Bill[] = [
  { id: 1, user_id: "preview", name: "Home internet", amount: 89, freq: "Monthly", day: 12 },
  { id: 2, user_id: "preview", name: "Gym membership", amount: 24, freq: "Weekly", day: 1 },
];
const PREVIEW_EVENTS: CalendarEvent[] = [
  { id: 1, user_id: "preview", title: "Weekly planning", date: toLocalISODate(new Date()), time: "08:30", note: null },
];
const PREVIEW_INBOX: InboxItem[] = [
  { id: 1, user_id: "preview", item_type: "message", sender: "Alex", platform: "iMessage", subject: null, content: "Can we confirm the time for tomorrow?", age: "2h", flag: "Reply", priority: 1, archived: false, unread: true, source_date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { id: 2, user_id: "preview", item_type: "email", sender: "Building manager", platform: "Gmail", subject: "Annual access review", content: "Please review the attached access details this week.", age: "1d", flag: "Review", priority: 2, archived: false, unread: true, source_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), source_url: "https://mail.google.com/" },
];
const PREVIEW_INBOX_SYNC: InboxSyncStatus[] = [
  { user_id: "preview", source: "imessage", last_synced_at: new Date().toISOString(), last_sync_status: "success", last_sync_error: null, item_count: 1 },
  { user_id: "preview", source: "gmail", last_synced_at: new Date().toISOString(), last_sync_status: "success", last_sync_error: null, item_count: 1 },
];

type Toast = { message: string; error?: boolean } | null;

function friendlyError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Something went wrong. Please try again.";
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? []).filter((item) => !item.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="dialog-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-head">
          <h2 id="dialog-title">{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Login({ onToast }: { onToast: (toast: Toast) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (resetMode) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (resetError) throw resetError;
        onToast({ message: "Password reset instructions sent." });
        setResetMode(false);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <img className="brand-mark" src="/mark.svg" alt="" />
          <h1 id="auth-title">Townsend OS</h1>
          <p>{resetMode ? "Reset your password" : "Your private operations workspace"}</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          {!resetMode && (
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
          )}
          <button className="button full" disabled={busy}>{busy ? "Please wait…" : resetMode ? "Send reset link" : "Sign in"}</button>
          <button className="text-button" type="button" onClick={() => { setResetMode((value) => !value); setError(""); }}>
            {resetMode ? "Back to sign in" : "Forgot your password?"}
          </button>
        </form>
        <div className="auth-footer">PRIVATE · AUTHENTICATED · ENCRYPTED IN TRANSIT</div>
      </section>
    </main>
  );
}

function PasswordRecovery({ onComplete, onToast }: { onComplete: () => void; onToast: (toast: Toast) => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 10) { setError("Use at least 10 characters."); return; }
    if (password !== confirmation) { setError("The passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      onToast({ message: "Password updated." });
      onComplete();
    } catch {
      setError("Unable to update the password. Request a new reset link and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell"><section className="auth-card" aria-labelledby="recovery-title">
      <div className="auth-brand"><img className="brand-mark" src="/mark.svg" alt="" /><h1 id="recovery-title">Choose a new password</h1><p>Secure your Townsend OS account.</p></div>
      <form className="auth-form" onSubmit={submit}>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="field"><label htmlFor="new-password">New password</label><input id="new-password" className="input" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        <div className="field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" className="input" type="password" autoComplete="new-password" required minLength={10} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
        <button className="button full" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
      </form>
    </section></main>
  );
}

function TaskRow({ task, onToggle, onActions }: { task: Task; onToggle: () => void; onActions: () => void }) {
  const due = dueLabel(task.due);
  return (
    <article className={`task-row${task.done ? " done" : ""}`} style={{ "--accent": CATEGORY_COLOURS[canonicalTaskCategory(task.cat, task.name)] } as React.CSSProperties}>
      <button className="check-button" onClick={onToggle} aria-label={`${task.done ? "Reopen" : "Complete"} ${task.name}`}>
        <span className="check-circle">{task.done && <Icon name="check" size={14} />}</span>
      </button>
      <div className="task-copy">
        <span className="task-name">{task.name}</span>
        <span className="task-meta">
          <span className="badge neutral">{task.cat}</span>
          <span className={`badge badge-dot ${task.priority === "high" ? "danger" : task.priority === "medium" ? "warning" : "info"}`}>{task.priority_code || task.priority}</span>
          {task.workflow_status === "waiting" && <span className="badge info">Waiting</span>}
          {task.workflow_status === "backlog" && <span className="badge neutral">Backlog</span>}
          {task.evidence && <span className={`badge ${task.evidence === "Confirmed" ? "success" : task.evidence === "Verify first" ? "warning" : "neutral"}`}>{task.evidence}</span>}
          {due && <span className={`badge ${due.tone}`}>{due.text}</span>}
        </span>
      </div>
      <button className="icon-button" onClick={onActions} aria-label={`Actions for ${task.name}`}><Icon name="more-horizontal" /></button>
    </article>
  );
}

function TaskActionDialog({ task, saving, onClose, onUpdate, onDelete }: {
  task: Task;
  saving: boolean;
  onClose: () => void;
  onUpdate: (changes: Partial<Task>) => void;
  onDelete: () => void;
}) {
  return (
    <Dialog title={task.name} onClose={onClose}>
      <div className="action-list">
        <button className="button secondary" disabled={saving} onClick={() => onUpdate({ done: !task.done, completed_at: task.done ? null : new Date().toISOString() })}>
          <Icon name="check" /> {task.done ? "Move back to active" : "Mark complete"}
        </button>
        <button className="button secondary" disabled={saving} onClick={() => onUpdate({ urgent: !task.urgent })}>
          <Icon name="flag" /> {task.urgent ? "Remove urgent flag" : "Mark urgent"}
        </button>
        <div className="field-row">
          <div className="field">
            <label htmlFor="task-priority">Priority</label>
            <select id="task-priority" className="select" value={task.priority} disabled={saving} onChange={(event) => onUpdate({ priority: event.target.value as Priority })}>
              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-category">Category</label>
            <select id="task-category" className="select" value={task.cat} disabled={saving} onChange={(event) => onUpdate({ cat: event.target.value })}>
              {TASK_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="task-due">Due date</label>
          <input id="task-due" className="input" type="date" disabled={saving} value={dateForDue(task.due) ?? ""} onChange={(event) => onUpdate({ due: event.target.value ? { type: "custom", date: event.target.value } : null })} />
        </div>
        {(task.next_action || task.source || task.external_id) && <div className="task-detail-block">
          {task.next_action && <div><span className="overline">Next action</span><p>{task.next_action}</p></div>}
          {task.source && <div><span className="overline">Source</span><p>{task.source}</p></div>}
          <div className="task-provenance">{task.external_id}{task.last_checked ? ` · checked ${new Date(`${task.last_checked}T00:00:00`).toLocaleDateString("en-AU")}` : ""}</div>
        </div>}
        <div className="field">
          <label htmlFor="task-workflow">Workflow</label>
          <select id="task-workflow" className="select" value={task.workflow_status || "open"} disabled={saving} onChange={(event) => onUpdate({ workflow_status: event.target.value as Task["workflow_status"] })}>
            <option value="open">Open</option><option value="waiting">Waiting</option><option value="backlog">Backlog</option>
          </select>
        </div>
        <button className="button danger" disabled={saving} onClick={onDelete}><Icon name="trash-2" /> Delete task</button>
      </div>
    </Dialog>
  );
}

function TasksPage({ tasks, saving, onAdd, onToggle, onUpdate, onDelete }: {
  tasks: Task[];
  saving: boolean;
  onAdd: (name: string, cat: string) => void;
  onToggle: (task: Task) => void;
  onUpdate: (task: Task, changes: Partial<Task>) => void;
  onDelete: (task: Task) => void;
}) {
  const [view, setView] = useState<TaskView>("open");
  const [category, setCategory] = useState("All");
  const [newTask, setNewTask] = useState("");
  const [newCategory, setNewCategory] = useState("Admin");
  const [selected, setSelected] = useState<Task | null>(null);
  const filtered = tasks.filter((task) => {
    if (view === "completed" && !task.done) return false;
    if (view !== "completed" && task.done) return false;
    if (view !== "completed" && (task.workflow_status || "open") !== view) return false;
    return category === "All" || task.cat === category;
  });
  const availableCategories = TASK_CATEGORIES.filter((item) => tasks.some((task) => task.cat === item && (view === "completed" ? task.done : !task.done && (task.workflow_status || "open") === view)));
  const urgent = tasks.filter((task) => !task.done && (task.urgent || task.priority === "high")).length;
  const done = tasks.filter((task) => task.done).length;

  useEffect(() => setCategory("All"), [view]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = newTask.trim();
    if (!value) return;
    onAdd(value, newCategory);
    setNewTask("");
  };

  return (
    <main className="content tasks-page">
      <div className="page-heading"><div><h1>Tasks</h1><p>Focus the day, then keep the longer horizon visible.</p></div></div>
      <div className="stat-grid" aria-label="Task summary">
        <div className="stat"><strong>{tasks.filter((task) => !task.done).length}</strong><span className="overline">Open</span></div>
        <div className="stat danger"><strong>{urgent}</strong><span className="overline">Priority</span></div>
        <div className="stat success"><strong>{done}</strong><span className="overline">Complete</span></div>
      </div>
      <div className="segmented" role="group" aria-label="Task view">
        {(["open", "waiting", "backlog", "completed"] as TaskView[]).map((item) => <button key={item} className={`segment${view === item ? " active" : ""}`} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
      </div>
      <div className="filter-row" aria-label="Filter by category">
        {["All", ...availableCategories].map((item) => <button key={item} className={`filter${category === item ? " active" : ""}`} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <section className="panel" style={{ "--accent": category === "All" ? "#14384f" : CATEGORY_COLOURS[canonicalTaskCategory(category)] } as React.CSSProperties}>
        <div className="panel-header"><div className="panel-title"><h2>{category === "All" ? `${view[0].toUpperCase() + view.slice(1)} tasks` : category}</h2><p>{filtered.length} {filtered.length === 1 ? "item" : "items"}</p></div></div>
        <div className="panel-body">
          {filtered.length ? filtered.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggle(task)} onActions={() => setSelected(task)} />) : <div className="empty-state">Nothing here. Add a task when you are ready.</div>}
        </div>
      </section>
      {view === "open" && (
        <form className="composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="new-task">New task</label>
          <input id="new-task" className="input" placeholder="Add a task…" value={newTask} onChange={(event) => setNewTask(event.target.value)} />
          <label className="sr-only" htmlFor="new-task-category">Category</label>
          <select id="new-task-category" className="select" value={newCategory} onChange={(event) => setNewCategory(event.target.value)}>{TASK_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
          <button className="button" disabled={saving || !newTask.trim()} aria-label="Add task"><Icon name="plus" /></button>
        </form>
      )}
      {selected && <TaskActionDialog task={tasks.find((task) => task.id === selected.id) ?? selected} saving={saving} onClose={() => setSelected(null)} onUpdate={(changes) => onUpdate(selected, changes)} onDelete={() => { onDelete(selected); setSelected(null); }} />}
    </main>
  );
}

function CalendarPage({ tasks, events, saving, syncSettings, syncBusy, onAdd, onDelete, onConfigureSync, onSync }: {
  tasks: Task[];
  events: CalendarEvent[];
  saving: boolean;
  syncSettings: CalendarSyncSettings | null;
  syncBusy: boolean;
  onAdd: (event: Omit<CalendarEvent, "id" | "user_id">) => void;
  onDelete: (event: CalendarEvent) => void;
  onConfigureSync: (feedUrl: string, calendarName: string) => Promise<boolean>;
  onSync: () => Promise<void>;
}) {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(toLocalISODate(today));
  const [dayTab, setDayTab] = useState<"tasks" | "events">("tasks");
  const taskTabRef = useRef<HTMLButtonElement>(null);
  const eventTabRef = useRef<HTMLButtonElement>(null);
  const [adding, setAdding] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [calendarName, setCalendarName] = useState(syncSettings?.calendar_name || "My calendar");
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const leading = new Date(year, monthIndex, 1).getDay();
  const count = new Date(year, monthIndex + 1, 0).getDate();
  const days = Array.from({ length: leading + count }, (_, index) => index < leading ? null : index - leading + 1);
  const taskOccursOnDate = (task: Task, date: string) => {
    const completionDate = task.completed_at && !Number.isNaN(Date.parse(task.completed_at))
      ? toLocalISODate(new Date(task.completed_at))
      : null;
    return dateForDue(task.due) === date || completionDate === date;
  };
  const datedTasks = tasks.filter((task) => taskOccursOnDate(task, selected));
  const datedEvents = events.filter((event) => event.date === selected);

  useEffect(() => setCalendarName(syncSettings?.calendar_name || "My calendar"), [syncSettings?.calendar_name]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), date: selected, time: time || null, note: null });
    setDayTab("events");
    setTitle(""); setTime(""); setAdding(false);
  };

  const selectDate = (date: string) => {
    setSelected(date);
    setDayTab("tasks");
  };

  const changeDayTab = (tab: "tasks" | "events", focus = false) => {
    setDayTab(tab);
    if (focus) (tab === "tasks" ? taskTabRef : eventTabRef).current?.focus();
  };

  const handleDayTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      changeDayTab(dayTab === "tasks" ? "events" : "tasks", true);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      changeDayTab(event.key === "Home" ? "tasks" : "events", true);
    }
  };

  const configureSync = async (event: FormEvent) => {
    event.preventDefault();
    const connected = await onConfigureSync(feedUrl.trim(), calendarName.trim() || "My calendar");
    if (!connected) return;
    setFeedUrl("");
    setConfiguring(false);
  };

  return (
    <main className="content">
      <div className="page-heading"><div><h1>Calendar</h1><p>Tasks, Townsend OS events, and your private calendar feed.</p></div><button className="button" onClick={() => setAdding(true)}><Icon name="plus" /> Add event</button></div>
      <section className={`sync-panel ${syncSettings?.last_sync_status || "never"}`}>
        <div className="sync-copy">
          <span className="sync-icon"><Icon name="refresh-cw" /></span>
          <div><strong>{syncSettings?.enabled ? syncSettings.calendar_name : "Connect your calendar"}</strong><p>{syncSettings?.last_sync_status === "success" && syncSettings.last_synced_at ? `Synced ${new Date(syncSettings.last_synced_at).toLocaleString("en-AU")}` : syncSettings?.last_sync_status === "error" ? syncSettings.last_sync_error || "The last sync failed." : "Add a private iCalendar address for read-only sync."}</p></div>
        </div>
        <div className="sync-actions">
          {syncSettings?.enabled && <button className="button secondary" disabled={syncBusy} onClick={onSync}><Icon name="refresh-cw" /> {syncBusy ? "Syncing…" : "Sync now"}</button>}
          <button className="button secondary" onClick={() => setConfiguring(true)}>{syncSettings?.enabled ? "Settings" : "Connect"}</button>
        </div>
      </section>
      <section className="calendar-card">
        <div className="calendar-head">
          <button className="icon-button" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))} aria-label="Previous month"><Icon name="chevron-left" /></button>
          <h2>{month.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}</h2>
          <button className="icon-button" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))} aria-label="Next month"><Icon name="chevron-right" /></button>
        </div>
        <div className="calendar-grid">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div className="weekday" key={day}>{day}</div>)}
          {days.map((day, index) => {
            if (!day) return <div key={`blank-${index}`} />;
            const date = toLocalISODate(new Date(year, monthIndex, day));
            const hasItems = events.some((item) => item.date === date) || tasks.some((task) => taskOccursOnDate(task, date));
            const className = `calendar-day${date === toLocalISODate(today) ? " today" : ""}${date === selected ? " selected" : ""}`;
            return <button key={date} className={className} onClick={() => selectDate(date)} aria-label={new Date(`${date}T00:00:00`).toLocaleDateString("en-AU", { dateStyle: "full" })}>{day}{hasItems && <span className="dots"><span className="dot" /></span>}</button>;
          })}
        </div>
      </section>
      <div className="section-heading"><h2>{new Date(`${selected}T00:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</h2></div>
      <div className="day-detail-tabs" role="tablist" aria-label="Items on selected date">
        <button ref={taskTabRef} id="calendar-tasks-tab" className={`day-detail-tab${dayTab === "tasks" ? " active" : ""}`} role="tab" aria-selected={dayTab === "tasks"} aria-controls="calendar-tasks-panel" tabIndex={dayTab === "tasks" ? 0 : -1} onClick={() => changeDayTab("tasks")} onKeyDown={handleDayTabKeyDown}>Tasks <span>{datedTasks.length}</span></button>
        <button ref={eventTabRef} id="calendar-events-tab" className={`day-detail-tab${dayTab === "events" ? " active" : ""}`} role="tab" aria-selected={dayTab === "events"} aria-controls="calendar-events-panel" tabIndex={dayTab === "events" ? 0 : -1} onClick={() => changeDayTab("events")} onKeyDown={handleDayTabKeyDown}>Events <span>{datedEvents.length}</span></button>
      </div>
      {dayTab === "tasks" ? (
        <div id="calendar-tasks-panel" role="tabpanel" aria-labelledby="calendar-tasks-tab" tabIndex={0}>
          {!datedTasks.length && <div className="empty-state panel">No tasks due or completed on this date.</div>}
          {datedTasks.map((task) => <div className="event-row" key={`task-${task.id}`} style={{ "--accent": CATEGORY_COLOURS[canonicalTaskCategory(task.cat, task.name)] } as React.CSSProperties}><Icon name="check-square" /><div className="row-main"><strong>{task.name}</strong><p>{task.cat} task · {task.priority} priority</p></div></div>)}
        </div>
      ) : (
        <div id="calendar-events-panel" role="tabpanel" aria-labelledby="calendar-events-tab" tabIndex={0}>
          {!datedEvents.length && <div className="empty-state panel">No events scheduled for this date.</div>}
          {datedEvents.map((item) => <div className="event-row" key={`event-${item.id}`}><Icon name="calendar" /><div className="row-main"><strong>{item.title}</strong><p>{item.time || "All day"}{item.location ? ` · ${item.location}` : ""}{item.note ? ` · ${item.note}` : ""}</p>{item.source === "ical" && <span className="event-source">{item.source_calendar || "Synced calendar"} · read only</span>}</div>{item.source !== "ical" && <button className="icon-button danger" disabled={saving} onClick={() => onDelete(item)} aria-label={`Delete ${item.title}`}><Icon name="trash-2" /></button>}</div>)}
        </div>
      )}
      {adding && <Dialog title="Add event" onClose={() => setAdding(false)}><form onSubmit={submit}><div className="field"><label htmlFor="event-title">Event name</label><input id="event-title" className="input" required value={title} onChange={(event) => setTitle(event.target.value)} /></div><div className="field-row"><div className="field"><label htmlFor="event-date">Date</label><input id="event-date" className="input" type="date" required value={selected} onChange={(event) => setSelected(event.target.value)} /></div><div className="field"><label htmlFor="event-time">Time</label><input id="event-time" className="input" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></div></div><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setAdding(false)}>Cancel</button><button className="button" disabled={saving}>Add event</button></div></form></Dialog>}
      {configuring && <Dialog title="Calendar sync" onClose={() => setConfiguring(false)}><form onSubmit={configureSync}><p className="dialog-intro">In Google Calendar, open your calendar settings and copy the private address in iCal format. Townsend OS will only read it.</p><div className="field"><label htmlFor="calendar-name">Calendar name</label><input id="calendar-name" className="input" required value={calendarName} onChange={(event) => setCalendarName(event.target.value)} /></div><div className="field"><label htmlFor="calendar-feed">Private iCalendar address</label><input id="calendar-feed" className="input" type="url" inputMode="url" required placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} /><small>Stored privately. Never share this address or commit it to code.</small></div><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setConfiguring(false)}>Cancel</button><button className="button" disabled={syncBusy || !feedUrl.trim()}>{syncBusy ? "Connecting…" : "Connect and sync"}</button></div></form></Dialog>}
    </main>
  );
}

function relativeAge(value?: string | null, fallback?: string | null) {
  if (!value) return fallback || "";
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function InboxPage({ items, syncStatus, saving, refreshing, onArchive, onRefresh }: {
  items: InboxItem[];
  syncStatus: InboxSyncStatus[];
  saving: boolean;
  refreshing: boolean;
  onArchive: (item: InboxItem) => void;
  onRefresh: () => void;
}) {
  const pageSize = 50;
  const [tab, setTab] = useState<"message" | "email">("message");
  const [pages, setPages] = useState<Record<"message" | "email", number>>({ message: 0, email: 0 });
  const syncedItems = items.some((item) => item.external_id) ? items.filter((item) => item.external_id) : items;
  const current = syncedItems.filter((item) => !item.archived && item.item_type === tab).sort((a, b) => new Date(b.source_date || b.created_at || 0).getTime() - new Date(a.source_date || a.created_at || 0).getTime());
  const page = Math.min(pages[tab], Math.max(0, Math.ceil(current.length / pageSize) - 1));
  const pageStart = page * pageSize;
  const paged = current.slice(pageStart, pageStart + pageSize);
  const priority = current.filter((item) => item.priority === 1).slice(0, 3);
  const source = tab === "message" ? "imessage" : "gmail";
  const status = syncStatus.find((item) => item.source === source);
  const messageCount = syncedItems.filter((item) => !item.archived && item.item_type === "message").length;
  const emailCount = syncedItems.filter((item) => !item.archived && item.item_type === "email").length;
  const syncAge = status?.last_synced_at ? relativeAge(status.last_synced_at) : "";
  const syncCopy = status?.last_sync_status === "success" && status.last_synced_at
    ? `Synced via ChatGPT ${syncAge === "now" ? "just now" : `${syncAge} ago`}`
    : status?.last_sync_status === "error"
      ? status.last_sync_error || "The last sync failed."
      : "Waiting for the first ChatGPT sync.";
  return (
    <main className="content">
      <div className="page-heading"><div><h1>Inbox</h1><p>Your recent iMessages and Gmail inbox, kept together.</p></div><button className="button secondary" disabled={refreshing} onClick={onRefresh}><Icon name="refresh-cw" /> {refreshing ? "Reloading…" : "Reload"}</button></div>
      <div className="stat-grid" aria-label="Inbox summary"><div className="stat"><strong>{syncedItems.filter((item) => !item.archived).length}</strong><span className="overline">Open</span></div><div className="stat danger"><strong>{syncedItems.filter((item) => !item.archived && item.priority === 1).length}</strong><span className="overline">Priority</span></div><div className="stat success"><strong>{syncedItems.filter((item) => item.archived).length}</strong><span className="overline">Archived</span></div></div>
      <div className="inbox-tabs" role="tablist" aria-label="Inbox source"><button role="tab" aria-selected={tab === "message"} className={`inbox-tab${tab === "message" ? " active" : ""}`} onClick={() => setTab("message")}>iMessages <span>{messageCount}</span></button><button role="tab" aria-selected={tab === "email"} className={`inbox-tab${tab === "email" ? " active" : ""}`} onClick={() => setTab("email")}>Gmail inbox <span>{emailCount}</span></button></div>
      <div className={`inbox-sync-status${status?.last_sync_status === "error" ? " error" : ""}`} role="status"><span className={`sync-dot${status?.last_sync_status === "success" ? " success" : status?.last_sync_status === "error" ? " error" : ""}`} /><span>{syncCopy}</span></div>
      {page === 0 && priority.length > 0 && <aside className="triage"><span className="overline">Do these first</span><ol>{priority.map((item) => <li key={item.id}>{item.subject || `${item.platform || "Message"} from ${item.sender}`}</li>)}</ol></aside>}
      {!current.length && <div className="empty-state panel">No open {tab === "message" ? "iMessages" : "Gmail messages"}.</div>}
      {paged.map((item) => <article className="inbox-card" key={item.id} style={{ "--accent": item.priority === 1 ? "#ae3b2e" : item.priority === 2 ? "#b07a12" : "#1f6f97" } as React.CSSProperties}><div className="inbox-head"><div><div className="inbox-sender">{item.sender}</div><div className="task-meta"><span className="badge neutral">{item.platform || (tab === "message" ? "iMessage" : "Gmail")}</span>{item.unread && <span className="badge info">Unread</span>}{item.flag && <span className="badge warning">{item.flag}</span>}</div></div><span className="inbox-age">{relativeAge(item.source_date, item.age)}</span></div>{item.subject && <div className="inbox-subject">{item.subject}</div>}<p className="inbox-content">{item.content}</p><div className="dialog-actions">{item.source_url && <a className="button secondary" href={item.source_url} target="_blank" rel="noreferrer">Open in Gmail</a>}<button className="button secondary" disabled={saving} onClick={() => onArchive(item)}><Icon name="archive" /> Archive</button></div></article>)}
      {current.length >= pageSize && <nav className="inbox-pagination" aria-label={`${tab === "message" ? "iMessage" : "Gmail"} pages`}><button className="button secondary" disabled={page === 0} onClick={() => setPages((value) => ({ ...value, [tab]: Math.max(0, page - 1) }))}><Icon name="chevron-left" /> Newer</button><span>{pageStart + 1}–{Math.min(pageStart + pageSize, current.length)} of {current.length}</span><button className="button secondary" disabled={pageStart + pageSize >= current.length} onClick={() => setPages((value) => ({ ...value, [tab]: page + 1 }))}>Older <Icon name="chevron-right" /></button></nav>}
    </main>
  );
}

function BillsPage({ bills, saving, onAdd, onDelete }: { bills: Bill[]; saving: boolean; onAdd: (bill: Omit<Bill, "id" | "user_id">) => void; onDelete: (bill: Bill) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [freq, setFreq] = useState<Bill["freq"]>("Monthly");
  const [day, setDay] = useState("1");
  const monthly = bills.reduce((sum, bill) => sum + (bill.freq === "Weekly" ? bill.amount * 52 / 12 : bill.amount), 0);
  const submit = (event: FormEvent) => { event.preventDefault(); const numeric = Number(amount); if (!name.trim() || !Number.isFinite(numeric) || numeric < 0) return; onAdd({ name: name.trim(), amount: numeric, freq, day: Number(day) }); setName(""); setAmount(""); setDay("1"); setAdding(false); };
  return (
    <main className="content">
      <div className="page-heading"><div><h1>Bills</h1><p>Recurring commitments and their next due date.</p></div><button className="button" onClick={() => setAdding(true)}><Icon name="plus" /> Add bill</button></div>
      <div className="stat-grid"><div className="stat"><strong>{bills.length}</strong><span className="overline">Recurring</span></div><div className="stat"><strong>{formatAUD(monthly)}</strong><span className="overline">Monthly est.</span></div><div className="stat success"><strong>{formatAUD(monthly * 12)}</strong><span className="overline">Annual est.</span></div></div>
      {!bills.length && <div className="empty-state panel">No recurring bills yet.</div>}
      {bills.map((bill) => { const due = billDueLabel(bill); return <article className="bill-row" key={bill.id} style={{ "--accent": "#b07a12" } as React.CSSProperties}><Icon name="credit-card" /><div className="row-main"><strong>{bill.name}</strong><p>{bill.freq} · {bill.freq === "Monthly" ? ordinal(bill.day) : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][bill.day]} · <span className={`badge ${due.tone}`}>{due.text}</span></p></div><span className="row-value">{formatAUD(bill.amount)}</span><button className="icon-button danger" disabled={saving} onClick={() => onDelete(bill)} aria-label={`Delete ${bill.name}`}><Icon name="trash-2" /></button></article>; })}
      {adding && <Dialog title="Add recurring bill" onClose={() => setAdding(false)}><form onSubmit={submit}><div className="field"><label htmlFor="bill-name">Bill name</label><input id="bill-name" className="input" required value={name} onChange={(event) => setName(event.target.value)} /></div><div className="field-row"><div className="field"><label htmlFor="bill-amount">Amount (AUD)</label><input id="bill-amount" className="input" type="number" min="0" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} /></div><div className="field"><label htmlFor="bill-frequency">Frequency</label><select id="bill-frequency" className="select" value={freq} onChange={(event) => setFreq(event.target.value as Bill["freq"])}><option>Monthly</option><option>Weekly</option></select></div></div><div className="field"><label htmlFor="bill-day">{freq === "Monthly" ? "Day of month" : "Day of week (0 Sunday to 6 Saturday)"}</label><input id="bill-day" className="input" type="number" min={freq === "Monthly" ? 1 : 0} max={freq === "Monthly" ? 31 : 6} required value={day} onChange={(event) => setDay(event.target.value)} /></div><div className="dialog-actions"><button className="button secondary" type="button" onClick={() => setAdding(false)}>Cancel</button><button className="button" disabled={saving}>Add bill</button></div></form></Dialog>}
    </main>
  );
}

export default function App() {
  const previewParams = new URLSearchParams(window.location.search);
  const preview = import.meta.env.DEV && previewParams.has("preview");
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState<AppPage>(preview && previewParams.get("page") === "wealth" ? "wealth" : "tasks");
  const [tasks, setTasks] = useState<Task[]>(preview ? PREVIEW_TASKS : []);
  const [bills, setBills] = useState<Bill[]>(preview ? PREVIEW_BILLS : []);
  const [events, setEvents] = useState<CalendarEvent[]>(preview ? PREVIEW_EVENTS : []);
  const [calendarSync, setCalendarSync] = useState<CalendarSyncSettings | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const syncBusyRef = useRef(false);
  const [inbox, setInbox] = useState<InboxItem[]>(preview ? PREVIEW_INBOX : []);
  const [inboxSync, setInboxSync] = useState<InboxSyncStatus[]>(preview ? PREVIEW_INBOX_SYNC : []);
  const [inboxRefreshing, setInboxRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const userId = session?.user.id;

  const showToast = useCallback((next: Toast) => {
    setToast(next);
    if (next) window.setTimeout(() => setToast(null), 3600);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError("Unable to restore your session. Please sign in again.");
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (!next && !preview) {
        setTasks([]);
        setBills([]);
        setEvents([]);
        setCalendarSync(null);
        setInbox([]);
        setInboxSync([]);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [preview]);

  const fetchData = useCallback(async () => {
    if (preview) return;
    if (!userId) return;
    setLoading(true); setError("");
    const [taskResult, billResult, eventResult, inboxResult, calendarSyncResult, inboxSyncResult] = await Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: true }),
      supabase.from("bills").select("*").order("created_at", { ascending: true }),
      supabase.from("events").select("*").order("date", { ascending: true }),
      supabase.from("inbox_items").select("*").order("priority", { ascending: true }).order("created_at", { ascending: false }),
      supabase.from("calendar_sync_settings").select("calendar_name, enabled, last_synced_at, last_sync_status, last_sync_error").maybeSingle(),
      supabase.from("inbox_sync_status").select("user_id, source, last_synced_at, last_sync_status, last_sync_error, item_count"),
    ]);
    const firstError = taskResult.error || billResult.error || eventResult.error || inboxResult.error || calendarSyncResult.error || inboxSyncResult.error;
    if (firstError) {
      if (import.meta.env.DEV) console.error("Workspace load failed", firstError);
      setError("Unable to load your workspace. Please try again.");
    }
    else {
      setTasks(((taskResult.data ?? []) as Task[]).map(canonicalizeTask));
      setBills((billResult.data ?? []) as Bill[]);
      setEvents((eventResult.data ?? []) as CalendarEvent[]);
      setInbox((inboxResult.data ?? []) as InboxItem[]);
      setInboxSync((inboxSyncResult.data ?? []) as InboxSyncStatus[]);
      setCalendarSync(calendarSyncResult.data as CalendarSyncSettings | null);
    }
    setLoading(false);
  }, [preview, userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const refreshInbox = useCallback(async () => {
    if (preview || !userId) return;
    setInboxRefreshing(true);
    const [itemsResult, statusResult] = await Promise.all([
      supabase.from("inbox_items").select("*").order("priority", { ascending: true }).order("source_date", { ascending: false }),
      supabase.from("inbox_sync_status").select("user_id, source, last_synced_at, last_sync_status, last_sync_error, item_count"),
    ]);
    if (itemsResult.error || statusResult.error) showToast({ message: "The inbox could not be reloaded.", error: true });
    else {
      setInbox((itemsResult.data ?? []) as InboxItem[]);
      setInboxSync((statusResult.data ?? []) as InboxSyncStatus[]);
    }
    setInboxRefreshing(false);
  }, [preview, showToast, userId]);

  useEffect(() => {
    if (page !== "inbox" || preview) return;
    const timer = window.setInterval(() => void refreshInbox(), 60_000);
    return () => window.clearInterval(timer);
  }, [page, preview, refreshInbox]);

  const runMutation = async (action: () => PromiseLike<{ error: { message: string } | null }>, onSuccess: () => void, success: string) => {
    setSaving(true);
    try {
      const { error: mutationError } = await action();
      if (mutationError) throw mutationError;
      onSuccess();
      showToast({ message: success });
    } catch (caught) {
      if (import.meta.env.DEV) console.error("Workspace change failed", caught);
      showToast({ message: "That change could not be saved. Please try again.", error: true });
    } finally {
      setSaving(false);
    }
  };

  const addTask = async (name: string, cat: string) => {
    const canonicalCategory = canonicalTaskCategory(cat, name);
    if (preview) { setTasks((items) => [...items, { id: Date.now(), user_id: "preview", name, cat: canonicalCategory, done: false, priority: "medium", due: null, urgent: false }]); showToast({ message: "Task added in preview." }); return; }
    if (!userId) return;
    setSaving(true);
    try {
      const { data, error: insertError } = await supabase.from("tasks").insert({ user_id: userId, name, cat: canonicalCategory, done: false, priority: "medium", due: null, urgent: false }).select().single();
      if (insertError) throw insertError;
      setTasks((items) => [...items, canonicalizeTask(data as Task)]); showToast({ message: "Task added." });
    } catch (caught) { if (import.meta.env.DEV) console.error("Task insert failed", caught); showToast({ message: "The task could not be added. Please try again.", error: true }); }
    finally { setSaving(false); }
  };

  const updateTask = (task: Task, changes: Partial<Task>) => {
    const normalizedChanges = changes.cat ? { ...changes, cat: canonicalTaskCategory(changes.cat, task.name) } : changes;
    return runMutation(
    () => preview ? Promise.resolve({ error: null }) : supabase.from("tasks").update(normalizedChanges).eq("id", task.id).eq("user_id", userId!).select("id").single(),
    () => setTasks((items) => items.map((item) => item.id === task.id ? { ...item, ...normalizedChanges } : item)),
    changes.done === true ? "Task completed." : changes.done === false ? "Task reopened." : "Task updated.",
  );
  };

  const deleteTask = (task: Task) => runMutation(() => preview ? Promise.resolve({ error: null }) : supabase.from("tasks").delete().eq("id", task.id).eq("user_id", userId!).select("id").single(), () => setTasks((items) => items.filter((item) => item.id !== task.id)), "Task deleted.");

  const addEvent = async (event: Omit<CalendarEvent, "id" | "user_id">) => {
    if (preview) { setEvents((items) => [...items, { ...event, id: Date.now(), user_id: "preview" }]); showToast({ message: "Event added in preview." }); return; }
    if (!userId) return;
    setSaving(true);
    try {
      const { data, error: insertError } = await supabase.from("events").insert({ ...event, user_id: userId }).select().single();
      if (insertError) throw insertError;
      setEvents((items) => [...items, data as CalendarEvent]); showToast({ message: "Event added." });
    } catch (caught) { if (import.meta.env.DEV) console.error("Event insert failed", caught); showToast({ message: "The event could not be added. Please try again.", error: true }); }
    finally { setSaving(false); }
  };
  const deleteEvent = (event: CalendarEvent) => runMutation(() => preview ? Promise.resolve({ error: null }) : supabase.from("events").delete().eq("id", event.id).eq("user_id", userId!).select("id").single(), () => setEvents((items) => items.filter((item) => item.id !== event.id)), "Event deleted.");

  const syncCalendar = useCallback(async (notify = true) => {
    if (preview || !userId || syncBusyRef.current) return;
    syncBusyRef.current = true;
    setSyncBusy(true);
    try {
      const { data, error: syncError } = await supabase.functions.invoke("calendar-sync", { body: { action: "sync" } });
      if (syncError) throw syncError;
      if (data?.error) throw new Error(data.error);
      await fetchData();
      if (notify) showToast({ message: `${data?.synced ?? 0} calendar events synced.` });
    } catch (caught) {
      if (import.meta.env.DEV) console.error("Calendar sync failed", caught);
      if (notify) showToast({ message: "Calendar sync failed. Check the private iCalendar address and try again.", error: true });
      await fetchData();
    } finally {
      syncBusyRef.current = false;
      setSyncBusy(false);
    }
  }, [fetchData, preview, showToast, userId]);

  const configureCalendarSync = async (feedUrl: string, calendarName: string) => {
    if (preview) { setCalendarSync({ calendar_name: calendarName, enabled: true, last_synced_at: new Date().toISOString(), last_sync_status: "success", last_sync_error: null }); return true; }
    if (!userId) return false;
    setSyncBusy(true);
    try {
      const { error: saveError } = await supabase.from("calendar_sync_settings").upsert({ user_id: userId, feed_url: feedUrl, calendar_name: calendarName, enabled: true }, { onConflict: "user_id" });
      if (saveError) throw saveError;
      const { data, error: syncError } = await supabase.functions.invoke("calendar-sync", { body: { action: "sync" } });
      if (syncError) throw syncError;
      if (data?.error) throw new Error(data.error);
      await fetchData();
      showToast({ message: `Calendar connected. ${data?.synced ?? 0} events synced.` });
      return true;
    } catch (caught) {
      if (import.meta.env.DEV) console.error("Calendar connection failed", caught);
      showToast({ message: "The calendar could not be connected. Check the private iCalendar address and try again.", error: true });
      return false;
    } finally {
      setSyncBusy(false);
    }
  };

  useEffect(() => {
    if (page !== "calendar" || preview || !calendarSync?.enabled || calendarSync.last_sync_status === "error") return;
    const stale = !calendarSync.last_synced_at || Date.now() - new Date(calendarSync.last_synced_at).getTime() > 15 * 60 * 1000;
    if (stale) void syncCalendar(false);
    const timer = window.setInterval(() => void syncCalendar(false), 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [calendarSync?.enabled, calendarSync?.last_sync_status, calendarSync?.last_synced_at, page, preview, syncCalendar]);

  const addBill = async (bill: Omit<Bill, "id" | "user_id">) => {
    if (preview) { setBills((items) => [...items, { ...bill, id: Date.now(), user_id: "preview" }]); showToast({ message: "Bill added in preview." }); return; }
    if (!userId) return;
    setSaving(true);
    try {
      const { data, error: insertError } = await supabase.from("bills").insert({ ...bill, user_id: userId }).select().single();
      if (insertError) throw insertError;
      setBills((items) => [...items, data as Bill]); showToast({ message: "Bill added." });
    } catch (caught) { if (import.meta.env.DEV) console.error("Bill insert failed", caught); showToast({ message: "The bill could not be added. Please try again.", error: true }); }
    finally { setSaving(false); }
  };
  const deleteBill = (bill: Bill) => runMutation(() => preview ? Promise.resolve({ error: null }) : supabase.from("bills").delete().eq("id", bill.id).eq("user_id", userId!).select("id").single(), () => setBills((items) => items.filter((item) => item.id !== bill.id)), "Bill deleted.");
  const archiveInbox = (item: InboxItem) => runMutation(() => preview ? Promise.resolve({ error: null }) : supabase.from("inbox_items").update({ archived: true }).eq("id", item.id).eq("user_id", userId!).select("id").single(), () => setInbox((items) => items.map((current) => current.id === item.id ? { ...current, archived: true } : current)), "Inbox item archived.");

  const heading = useMemo(() => NAV.find((item) => item.id === page)?.label ?? "Townsend OS", [page]);

  if (!authReady) return <div className="loading-screen"><div className="loading-state"><span className="spinner" /> Securing your workspace…</div></div>;
  if (session && recovering) return <><PasswordRecovery onComplete={() => setRecovering(false)} onToast={showToast} />{toast && <div className={`toast${toast.error ? " error" : ""}`} role="status">{toast.message}</div>}<Analytics /></>;
  if (!session && !preview) return <><Login onToast={showToast} />{toast && <div className={`toast${toast.error ? " error" : ""}`} role="status">{toast.message}</div>}<Analytics /></>;

  return (
    <div className="app-shell">
      <header className="app-header"><div className="header-inner"><img className="brand-mark" src="/mark.svg" alt="" /><div className="brand-copy"><strong>Townsend OS</strong><span>{heading.toUpperCase()} · {preview ? "LOCAL PREVIEW" : "PRIVATE WORKSPACE"}</span></div><nav className="desktop-nav" aria-label="Primary navigation">{NAV.map((item) => <button key={item.id} className={`nav-button${page === item.id ? " active" : ""}`} onClick={() => setPage(item.id)}>{item.label}</button>)}</nav><button className="icon-button" onClick={() => preview ? window.location.assign("/") : supabase.auth.signOut()} aria-label={preview ? "Exit preview" : "Sign out"}><Icon name="log-out" /></button></div></header>
      {error && <div className="content"><div className="page-error" role="alert">Could not load your workspace: {error} <button className="text-button" onClick={fetchData}>Try again</button></div></div>}
      {loading ? <div className="loading-screen"><div className="loading-state"><span className="spinner" /> Loading your workspace…</div></div> : <>
        {page === "tasks" && <TasksPage tasks={tasks} saving={saving} onAdd={addTask} onToggle={(task) => updateTask(task, { done: !task.done, completed_at: task.done ? null : new Date().toISOString() })} onUpdate={updateTask} onDelete={deleteTask} />}
        {page === "calendar" && <CalendarPage tasks={tasks} events={events} saving={saving} syncSettings={calendarSync} syncBusy={syncBusy} onAdd={addEvent} onDelete={deleteEvent} onConfigureSync={configureCalendarSync} onSync={() => syncCalendar(true)} />}
        {page === "inbox" && <InboxPage items={inbox} syncStatus={inboxSync} saving={saving} refreshing={inboxRefreshing} onArchive={archiveInbox} onRefresh={() => void refreshInbox()} />}
        {page === "bills" && <BillsPage bills={bills} saving={saving} onAdd={addBill} onDelete={deleteBill} />}
        {page === "wealth" && <Suspense fallback={<div className="loading-screen"><div className="loading-state"><span className="spinner" /> Loading Wealth…</div></div>}><WealthPage preview={preview} userId={userId || "preview"} onToast={showToast} /></Suspense>}
      </>}
      <nav className="bottom-nav" aria-label="Primary navigation">{NAV.map((item) => <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)} aria-current={page === item.id ? "page" : undefined}><Icon name={item.icon} size={20} /><span>{item.label}</span></button>)}</nav>
      {toast && <div className={`toast${toast.error ? " error" : ""}`} role="status"><Icon name={toast.error ? "alert-triangle" : "check"} />{toast.message}</div>}
      <Analytics />
    </div>
  );
}
