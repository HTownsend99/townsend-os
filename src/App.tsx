import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";
import type { Session } from "@supabase/supabase-js";

/* ══════════════════════════════════════════════
   THEME CONFIG
   ══════════════════════════════════════════════ */
const THEMES: Record<string, any> = {
  "Today":       { bg:"#fff9e6", bg2:"#fff3cc", accent:"#b8860b", border:"#dfc44a", text:"#7a5a00", sub:"#a07800", card:"#fffdf5", check:"#b8860b" },
  "Upcoming":    { bg:"#e8f4fd", bg2:"#d0e8fa", accent:"#1a6fa0", border:"#7cb8db", text:"#0f4c75", sub:"#2180b0", card:"#f3faff", check:"#1a6fa0" },
  "Admin":       { bg:"#f3eafa", bg2:"#e6d5f7", accent:"#7d3c98", border:"#b580d0", text:"#5b2d73", sub:"#8e44ad", card:"#faf6fe", check:"#7d3c98" },
  "Financial":   { bg:"#e8f8ef", bg2:"#d0f0dc", accent:"#1a7a40", border:"#7ec8a0", text:"#145a30", sub:"#22944e", card:"#f4fcf7", check:"#1a7a40" },
  "Future Buys": { bg:"#fce8fa", bg2:"#f5ccf2", accent:"#c020a0", border:"#e080d0", text:"#8a1878", sub:"#d030a8", card:"#fef4fd", check:"#c020a0" },
  "Shopping":    { bg:"#fef3e2", bg2:"#fde5c0", accent:"#a06800", border:"#deb060", text:"#7a5000", sub:"#c07800", card:"#fffbf2", check:"#a06800" },
  "Concepts":    { bg:"#e2f7f5", bg2:"#c8f0ec", accent:"#107870", border:"#70c8c0", text:"#0a5a54", sub:"#149088", card:"#f0fcfa", check:"#107870" },
  "Long Term":   { bg:"#eeebf7", bg2:"#ddd6f2", accent:"#5040a0", border:"#9888d0", text:"#3a3080", sub:"#6858b8", card:"#f8f6fe", check:"#5040a0" },
  "Job / Career":{ bg:"#fef5e6", bg2:"#fdeacc", accent:"#a07000", border:"#d8b050", text:"#785400", sub:"#c08a00", card:"#fffbf0", check:"#a07000" },
  "Health":      { bg:"#e8f5e8", bg2:"#d0ecd0", accent:"#268028", border:"#80c882", text:"#1a6020", sub:"#30a034", card:"#f2fbf2", check:"#268028" },
  "Socialising": { bg:"#f7e8fa", bg2:"#f0d0f8", accent:"#8828a8", border:"#c080d8", text:"#6a2088", sub:"#a838c0", card:"#fdf4ff", check:"#8828a8" },
  "Events":      { bg:"#fde8eb", bg2:"#fad0d6", accent:"#b82830", border:"#e08088", text:"#8a1e24", sub:"#d03840", card:"#fef4f5", check:"#b82830" },
  "Bills":       { bg:"#fef8e6", bg2:"#fdf0c8", accent:"#907000", border:"#c8a840", text:"#6a5200", sub:"#a88800", card:"#fffcf0", check:"#907000" },
};

const CATS = ["Today","Upcoming","Admin","Financial","Future Buys","Shopping","Concepts","Long Term","Job / Career","Health","Socialising","Events","Bills"];
const DEF_PRI: Record<string, string> = { "Today":"high","Upcoming":"high","Admin":"medium","Financial":"high","Future Buys":"low","Shopping":"low","Concepts":"medium","Long Term":"low","Job / Career":"high","Health":"medium","Socialising":"low","Events":"high","Bills":"high" };

const DEFAULT_TASKS = [
  {cat:"Upcoming",name:"Arrange jumper pickup/dropoff from Alfie",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Upcoming",name:"Review pet insurance / consider new policy",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Upcoming",name:"Send Brooke bylaws and redirect water invoice",done:false,priority:"high",due:null,urgent:false},
  {cat:"Upcoming",name:"Check saved folder from other computer",done:false,priority:"low",due:null,urgent:false},
  {cat:"Upcoming",name:"Forward BC details to QS",done:false,priority:"high",due:null,urgent:false},
  {cat:"Admin",name:"Clear out photos",done:false,priority:"low",due:null,urgent:false},
  {cat:"Admin",name:"Respond to messages",done:false,priority:"high",due:null,urgent:false},
  {cat:"Admin",name:"Clear out emails",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Admin",name:"Coordinate shipping with Paddy",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Admin",name:"Go through saved photos",done:false,priority:"low",due:null,urgent:false},
  {cat:"Financial",name:"Prepare tax documents",done:false,priority:"high",due:null,urgent:false},
  {cat:"Financial",name:"Create spending review",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Financial",name:"Create budget plan",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Financial",name:"Create recurring expenses summary",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Future Buys",name:"Rug",done:false,priority:"low",due:null,urgent:false},
  {cat:"Future Buys",name:"Genetic testing",done:false,priority:"low",due:null,urgent:false},
  {cat:"Future Buys",name:"Film Camera",done:false,priority:"low",due:null,urgent:false},
  {cat:"Shopping",name:"Fix Watches",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Concepts",name:"Power process",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Concepts",name:"HALT (AA)",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Concepts",name:"The Shadow",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Long Term",name:"Barrister",done:false,priority:"low",due:null,urgent:false},
  {cat:"Long Term",name:"Doctorate",done:false,priority:"high",due:null,urgent:false},
  {cat:"Long Term",name:"AI OnlyFans",done:false,priority:"low",due:null,urgent:false},
  {cat:"Long Term",name:"Brag sheet",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Long Term",name:"Brainstorm business ideas",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Job / Career",name:"Update resume",done:false,priority:"high",due:null,urgent:false},
  {cat:"Job / Career",name:"Contact recruiters",done:false,priority:"high",due:null,urgent:false},
  {cat:"Job / Career",name:"Apply for positions",done:false,priority:"high",due:null,urgent:false},
  {cat:"Job / Career",name:"Apply for GAMSAT",done:false,priority:"high",due:{type:"custom",date:"2026-06-30"},urgent:true},
  {cat:"Job / Career",name:"Draft career plan",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Health",name:"Prepare gym program",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Health",name:"Prepare meal plan and track calories",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Health",name:"Write goals for 2026",done:false,priority:"high",due:null,urgent:false},
  {cat:"Health",name:"Prepare journal questions",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Health",name:"Create list of habits and daily routine",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Socialising",name:"Sign up to social netball",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Socialising",name:"Enquire about rowing",done:false,priority:"medium",due:null,urgent:false},
  {cat:"Socialising",name:"Post on Instagram",done:false,priority:"low",due:null,urgent:false},
];

const DEFAULT_BILLS = [
  { name: "Mortgage — Bendigo Bank", amount: 3088, freq: "Monthly", day: 16 },
  { name: "Rent", amount: 280, freq: "Weekly", day: 4 },
];

/* ══════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════ */
function getDueLabel(due: any) {
  if (!due) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (due.type === "today") return { text: "Today", cls: "due-today" };
  if (due.type === "tomorrow") return { text: "Tomorrow", cls: "has-date" };
  if (due.type === "week") return { text: "This week", cls: "has-date" };
  if (due.type === "month") return { text: "This month", cls: "has-date" };
  if (due.type === "custom" && due.date) {
    const d = new Date(due.date + "T00:00:00");
    const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
    const label = d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    if (diff < 0) return { text: "Overdue " + label, cls: "overdue" };
    if (diff === 0) return { text: "Today", cls: "due-today" };
    if (diff === 1) return { text: "Tomorrow", cls: "has-date" };
    return { text: label, cls: "has-date" };
  }
  return null;
}

function getBillDue(bill: any) {
  const now = new Date();
  if (bill.freq === "Monthly") {
    const d = bill.day - now.getDate();
    if (d < 0) return { label: `Overdue (${Math.abs(d)}d)`, cls: "due-overdue" };
    if (d <= 5) return { label: `Due in ${d}d`, cls: "due-soon" };
    return { label: `Due in ${d}d`, cls: "due-ok" };
  }
  if (bill.freq === "Weekly") {
    const d = (bill.day - now.getDay() + 7) % 7 || 7;
    if (d <= 1) return { label: d === 0 ? "Due today" : "Tomorrow", cls: "due-soon" };
    return { label: `Due in ${d}d`, cls: "due-ok" };
  }
  return { label: "", cls: "" };
}

function getTaskDate(due: any): string | null {
  if (!due) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (due.type === "today") return today.toISOString().slice(0, 10);
  if (due.type === "tomorrow") { const d = new Date(today); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
  if (due.type === "week") { const d = new Date(today); d.setDate(d.getDate() + (7 - d.getDay())); return d.toISOString().slice(0, 10); }
  if (due.type === "month") { const d = new Date(today.getFullYear(), today.getMonth() + 1, 0); return d.toISOString().slice(0, 10); }
  if (due.type === "custom" && due.date) return due.date;
  return null;
}

const FONT = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

const priStyle = (p: string) => {
  if (p === "high") return { background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5", fontWeight: 700 as const, fontSize: 10, padding: "2px 8px", borderRadius: 6, cursor: "pointer" as const, whiteSpace: "nowrap" as const, lineHeight: "18px" };
  if (p === "low") return { background: "#dbeafe", color: "#1d4ed8", border: "1px solid #93c5fd", fontWeight: 700 as const, fontSize: 10, padding: "2px 8px", borderRadius: 6, cursor: "pointer" as const, whiteSpace: "nowrap" as const, lineHeight: "18px" };
  return { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d", fontWeight: 700 as const, fontSize: 10, padding: "2px 8px", borderRadius: 6, cursor: "pointer" as const, whiteSpace: "nowrap" as const, lineHeight: "18px" };
};

const dueStyle = (dl: any) => {
  const base: any = { fontSize: 10, padding: "2px 8px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap", lineHeight: "18px", fontWeight: 600, border: "1px solid #e5e7eb", color: "#9ca3af", background: "transparent", fontFamily: FONT };
  if (!dl) return base;
  if (dl.cls === "overdue") return { ...base, border: "1px solid #fca5a5", color: "#dc2626", background: "#fef2f2" };
  if (dl.cls === "due-today") return { ...base, border: "1px solid #fcd34d", color: "#d97706", background: "#fffbeb" };
  return { ...base, border: "1px solid #93c5fd", color: "#2563eb", background: "#eff6ff" };
};

const smallBtn: any = { fontSize: 11, padding: "2px 6px", borderRadius: 6, border: "1px solid #e5e7eb", color: "#9ca3af", cursor: "pointer", background: "transparent", lineHeight: "18px" };

/* ══════════════════════════════════════════════
   MAIN APP
   ══════════════════════════════════════════════ */
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  const [tasks, setTasks] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState<"tasks" | "calendar">("tasks");
  const [activeTab, setActiveTab] = useState("All");
  const [dueModal, setDueModal] = useState<number | null>(null);
  const [moveModal, setMoveModal] = useState<number | null>(null);
  const [addBillModal, setAddBillModal] = useState(false);
  const [newBill, setNewBill] = useState({ name: "", amount: "", freq: "Monthly", day: "1" });
  const [addInput, setAddInput] = useState("");
  const [addCat, setAddCat] = useState("Today");
  const [customDate, setCustomDate] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  /* ── Auth ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  /* ── Data fetch ── */
  const fetchData = useCallback(async () => {
    if (!session) return;
    const [{ data: t }, { data: b }] = await Promise.all([
      supabase.from("tasks").select("*").order("id"),
      supabase.from("bills").select("*").order("id"),
    ]);
    if (t && t.length > 0) setTasks(t);
    else {
      // Seed defaults on first login
      const userId = session.user.id;
      const rows = DEFAULT_TASKS.map(d => ({ ...d, user_id: userId }));
      const { data: inserted } = await supabase.from("tasks").insert(rows).select();
      if (inserted) setTasks(inserted);
    }
    if (b && b.length > 0) setBills(b);
    else {
      const userId = session.user.id;
      const rows = DEFAULT_BILLS.map(d => ({ ...d, user_id: userId }));
      const { data: inserted } = await supabase.from("bills").insert(rows).select();
      if (inserted) setBills(inserted);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => { if (session) fetchData(); }, [session, fetchData]);

  /* ── Auth handlers ── */
  const handleAuth = async () => {
    setAuthError("");
    if (authMode === "signup") {
      const { error } = await supabase.auth.signUp({ email: authEmail, password: authPass });
      if (error) setAuthError(error.message);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPass });
      if (error) setAuthError(error.message);
    }
  };

  /* ── Task CRUD ── */
  const toggleDone = async (id: number) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const next = !t.done;
    setTasks(prev => prev.map(x => x.id === id ? { ...x, done: next } : x));
    await supabase.from("tasks").update({ done: next }).eq("id", id);
  };

  const cyclePriority = async (id: number) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const cycle: Record<string, string> = { high: "medium", medium: "low", low: "high" };
    const next = cycle[t.priority];
    setTasks(prev => prev.map(x => x.id === id ? { ...x, priority: next } : x));
    await supabase.from("tasks").update({ priority: next }).eq("id", id);
  };

  const setDue = async (id: number, due: any) => {
    setTasks(prev => prev.map(x => x.id === id ? { ...x, due } : x));
    await supabase.from("tasks").update({ due }).eq("id", id);
  };

  const moveTask = async (id: number, cat: string) => {
    const pri = DEF_PRI[cat] || "medium";
    setTasks(prev => prev.map(x => x.id === id ? { ...x, cat, priority: pri } : x));
    await supabase.from("tasks").update({ cat, priority: pri }).eq("id", id);
  };

  const deleteTask = async (id: number) => {
    setTasks(prev => prev.filter(x => x.id !== id));
    await supabase.from("tasks").delete().eq("id", id);
  };

  const addTask = async () => {
    if (!addInput.trim() || !session) return;
    const row = { user_id: session.user.id, cat: addCat, name: addInput.trim(), done: false, priority: DEF_PRI[addCat] || "medium", due: null, urgent: false };
    const { data } = await supabase.from("tasks").insert(row).select().single();
    if (data) setTasks(prev => [...prev, data]);
    setAddInput(""); setActiveTab(addCat);
  };

  const addBillFn = async () => {
    if (!newBill.name.trim() || !newBill.amount || !session) return;
    const row = { user_id: session.user.id, name: newBill.name.trim(), amount: parseFloat(newBill.amount), freq: newBill.freq, day: parseInt(newBill.day) };
    const { data } = await supabase.from("bills").insert(row).select().single();
    if (data) setBills(prev => [...prev, data]);
    setNewBill({ name: "", amount: "", freq: "Monthly", day: "1" }); setAddBillModal(false);
  };

  const deleteBill = async (id: number) => {
    setBills(prev => prev.filter(x => x.id !== id));
    await supabase.from("bills").delete().eq("id", id);
  };

  /* ── Auth loading ── */
  if (authLoading) return <div style={{ padding: 40, textAlign: "center", color: "#888", fontFamily: FONT }}>Loading...</div>;

  /* ── Auth screen ── */
  if (!session) return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: "0 20px", fontFamily: FONT }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#b8860b", letterSpacing: -1 }}>Big Dawg HQ</div>
        <div style={{ fontSize: 14, color: "#888", marginTop: 4 }}>{authMode === "signin" ? "Sign in to your account" : "Create your account"}</div>
      </div>
      <input value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="Email" type="email"
        style={{ width: "100%", padding: "12px 14px", border: "1px solid #ddd", borderRadius: 10, fontSize: 15, marginBottom: 10, boxSizing: "border-box", fontFamily: FONT, outline: "none" }} />
      <input value={authPass} onChange={e => setAuthPass(e.target.value)} placeholder="Password" type="password"
        onKeyDown={e => e.key === "Enter" && handleAuth()}
        style={{ width: "100%", padding: "12px 14px", border: "1px solid #ddd", borderRadius: 10, fontSize: 15, marginBottom: 12, boxSizing: "border-box", fontFamily: FONT, outline: "none" }} />
      {authError && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>{authError}</div>}
      <button onClick={handleAuth} style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "#b8860b", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
        {authMode === "signin" ? "Sign in" : "Sign up"}
      </button>
      <div style={{ textAlign: "center", marginTop: 16 }}>
        <button onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")} style={{ background: "none", border: "none", color: "#2563eb", fontSize: 13, cursor: "pointer", fontFamily: FONT }}>
          {authMode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#888", fontFamily: FONT }}>Loading your tasks...</div>;

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const openCount = tasks.filter(t => !t.done).length;
  const highCount = tasks.filter(t => t.priority === "high" && !t.done).length;
  const urgentCount = tasks.filter(t => t.urgent && !t.done).length;
  const doneCount = tasks.filter(t => t.done).length;

  /* ══════════════════════════════════════════════
     COMPONENTS
     ══════════════════════════════════════════════ */

  const TaskCard = ({ t, theme }: { t: any; theme: any }) => {
    const dl = getDueLabel(t.due);
    const isOverdue = dl && dl.cls === "overdue";
    const isBold = t.priority === "high" || t.urgent || isOverdue;
    const isItalic = t.priority === "low" && !t.urgent && !isOverdue;

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 4, borderRadius: 10, border: `1px solid ${theme.border}40`, background: theme.card, opacity: t.done ? 0.35 : 1, borderLeft: `4px solid ${theme.accent}`, transition: "opacity 0.2s" }}>
        <button onClick={() => toggleDone(t.id)} style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, cursor: "pointer", border: t.done ? "none" : `2.5px solid ${theme.accent}60`, display: "flex", alignItems: "center", justifyContent: "center", background: t.done ? "#22c55e" : "transparent" }}>
          {t.done && <svg width="11" height="9" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>}
        </button>
        <span style={{ flex: 1, fontSize: 16, lineHeight: 1.35, color: t.done ? "#aaa" : "#1a1a1a", fontWeight: isBold ? 700 : isItalic ? 400 : 500, fontStyle: isItalic ? "italic" : "normal", textDecoration: t.done ? "line-through" : "none", minWidth: 0 }}>{t.name}</span>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
          <button onClick={() => cyclePriority(t.id)} style={priStyle(t.priority)}>{t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}</button>
          {t.urgent && <span style={{ fontSize: 9, background: "#ef4444", color: "#fff", padding: "1px 6px", borderRadius: 5, fontWeight: 800, animation: "pulse 1.5s infinite" }}>URGENT</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <button onClick={() => { setDueModal(t.id); setCustomDate(t.due?.type === "custom" ? t.due.date : ""); }} style={dueStyle(dl)}>{dl ? dl.text : "+ Date"}</button>
          <div style={{ display: "flex", gap: 3 }}>
            <button onClick={() => setMoveModal(t.id)} style={smallBtn}>↗</button>
            <button onClick={() => setDeleteConfirm(t.id)} style={{ ...smallBtn, fontSize: 10 }}>✕</button>
          </div>
        </div>
      </div>
    );
  };

  const HeadingBlock = ({ cat }: { cat: string }) => {
    const th = THEMES[cat];
    const catTasks = tasks.filter(t => t.cat === cat);
    const active = catTasks.filter(t => !t.done);
    const done = catTasks.filter(t => t.done);
    const high = active.filter(t => t.priority === "high" || t.urgent);
    const rest = active.filter(t => t.priority !== "high" && !t.urgent);
    const hc = high.length;
    return (
      <div style={{ margin: "0 12px 16px", borderRadius: 16, overflow: "hidden", border: `1.5px solid ${th.border}`, background: th.bg }}>
        <div style={{ padding: "16px 16px 12px", background: `linear-gradient(135deg, ${th.bg2}, ${th.bg})` }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.8, lineHeight: 1, color: th.text }}>{cat}</div>
          <div style={{ fontSize: 12, marginTop: 4, color: th.sub, fontWeight: 600 }}>{active.length} open{hc > 0 && ` · ${hc} high priority`}</div>
        </div>
        <div style={{ padding: "4px 8px 8px" }}>
          {high.map(t => <TaskCard key={t.id} t={t} theme={th} />)}
          {rest.map(t => <TaskCard key={t.id} t={t} theme={th} />)}
          {!active.length && !done.length && <div style={{ textAlign: "center", padding: 16, color: "#aaa", fontSize: 13 }}>No tasks yet</div>}
          {done.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: th.sub, textTransform: "uppercase", letterSpacing: 1, margin: "8px 0 4px", paddingTop: 6, borderTop: `1px solid ${th.border}60` }}>Completed ({done.length})</div>
              {done.map(t => <TaskCard key={t.id} t={t} theme={th} />)}
            </>
          )}
        </div>
      </div>
    );
  };

  const BillBlock = () => {
    const th = THEMES["Bills"];
    return (
      <div style={{ margin: "0 12px 16px", borderRadius: 16, overflow: "hidden", border: `1.5px solid ${th.border}`, background: th.bg }}>
        <div style={{ padding: "16px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", background: `linear-gradient(135deg, ${th.bg2}, ${th.bg})` }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.8, lineHeight: 1, color: th.text }}>Bills</div>
            <div style={{ fontSize: 12, marginTop: 4, color: th.sub, fontWeight: 600 }}>{bills.length} tracked</div>
          </div>
          <button onClick={() => setAddBillModal(true)} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${th.border}`, color: th.text, fontWeight: 700, background: "transparent", cursor: "pointer" }}>+ Add bill</button>
        </div>
        <div style={{ padding: "4px 8px 8px" }}>
          {bills.map(b => {
            const s = getBillDue(b);
            const cls = s.cls === "due-overdue" ? { color: "#dc2626", fontWeight: 700 } : s.cls === "due-soon" ? { color: "#d97706", fontWeight: 600 } : { color: "#22c55e" };
            return (
              <div key={b.id} style={{ background: th.card, border: `1px solid ${th.border}50`, borderRadius: 10, padding: "10px 12px", marginBottom: 4, borderLeft: `4px solid ${th.accent}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{b.name}</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: th.accent }}>${b.amount.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: "#888" }}>{b.freq} — {b.freq === "Monthly" ? `${b.day}th of each month` : "Every Thursday"}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, ...cls }}>{s.label}</span>
                    <button onClick={() => deleteBill(b.id)} style={{ fontSize: 11, color: "#ccc", cursor: "pointer", background: "none", border: "none" }}>✕</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const Overlay = ({ children, onClose }: { children: any; onClose: () => void }) => (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, width: 280, maxWidth: "90vw", boxShadow: "0 8px 30px rgba(0,0,0,0.15)", maxHeight: "80vh", overflowY: "auto" }}>{children}</div>
    </div>
  );

  /* ══════════════════════════════════════════════
     CALENDAR PAGE
     ══════════════════════════════════════════════ */
  const CalendarPage = () => {
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
    const monthName = new Date(calYear, calMonth).toLocaleDateString("en-AU", { month: "long", year: "numeric" });

    // Map dates to tasks
    const dateMap: Record<string, any[]> = {};
    tasks.filter(t => !t.done).forEach(t => {
      const d = getTaskDate(t.due);
      if (d) {
        if (!dateMap[d]) dateMap[d] = [];
        dateMap[d].push(t);
      }
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const cells: any[] = [];
    // Pad start
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, date: ds, tasks: dateMap[ds] || [] });
    }

    const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); };
    const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); };

    const selTasks = selectedDate ? (dateMap[selectedDate] || []) : [];

    return (
      <div style={{ padding: "12px 12px 0" }}>
        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button onClick={prevMonth} style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", color: "#666", padding: "4px 10px" }}>‹</button>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>{monthName}</span>
          <button onClick={nextMonth} style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", color: "#666", padding: "4px 10px" }}>›</button>
        </div>

        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#999", padding: 4 }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {cells.map((cell, i) => {
            if (!cell) return <div key={`empty-${i}`} />;
            const isToday = cell.date === todayStr;
            const isSelected = cell.date === selectedDate;
            const hasItems = cell.tasks.length > 0;
            const cats = [...new Set(cell.tasks.map((t: any) => t.cat))];

            return (
              <button key={cell.date} onClick={() => setSelectedDate(isSelected ? null : cell.date)}
                style={{
                  padding: "6px 2px 8px", borderRadius: 10, border: isSelected ? "2px solid #b8860b" : isToday ? "2px solid #2563eb" : "1px solid #eee",
                  background: isSelected ? "#fff9e6" : isToday ? "#eff6ff" : "#fff", cursor: "pointer", textAlign: "center", position: "relative", minHeight: 48,
                }}>
                <div style={{ fontSize: 14, fontWeight: isToday ? 800 : 500, color: isToday ? "#2563eb" : "#1a1a1a" }}>{cell.day}</div>
                {hasItems && (
                  <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 3, flexWrap: "wrap" }}>
                    {cats.slice(0, 3).map((c: string) => (
                      <div key={c} style={{ width: 6, height: 6, borderRadius: "50%", background: THEMES[c]?.accent || "#888" }} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected date tasks */}
        {selectedDate && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
              <span style={{ fontSize: 13, fontWeight: 500, color: "#888", marginLeft: 8 }}>{selTasks.length} task{selTasks.length !== 1 ? "s" : ""}</span>
            </div>
            {selTasks.length === 0 && <div style={{ color: "#aaa", fontSize: 14, padding: "12px 0" }}>Nothing scheduled for this date</div>}
            {selTasks.map(t => {
              const th = THEMES[t.cat] || THEMES["Today"];
              return <TaskCard key={t.id} t={t} theme={th} />;
            })}
          </div>
        )}

        {/* Upcoming items list */}
        <div style={{ marginTop: 24, paddingBottom: 80 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", marginBottom: 10 }}>Upcoming</div>
          {(() => {
            const upcoming = tasks
              .filter(t => !t.done && getTaskDate(t.due))
              .map(t => ({ ...t, _date: getTaskDate(t.due)! }))
              .filter(t => t._date >= todayStr)
              .sort((a, b) => a._date.localeCompare(b._date))
              .slice(0, 15);
            if (!upcoming.length) return <div style={{ color: "#aaa", fontSize: 14 }}>No upcoming dated tasks</div>;
            let lastDate = "";
            return upcoming.map(t => {
              const th = THEMES[t.cat] || THEMES["Today"];
              const showDate = t._date !== lastDate;
              lastDate = t._date;
              return (
                <div key={t.id}>
                  {showDate && <div style={{ fontSize: 12, fontWeight: 700, color: "#666", marginTop: 10, marginBottom: 4 }}>{new Date(t._date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</div>}
                  <TaskCard t={t} theme={th} />
                </div>
              );
            });
          })()}
        </div>
      </div>
    );
  };

  /* ══════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════ */
  return (
    <div style={{ maxWidth: 520, margin: "0 auto", paddingBottom: 80, background: "#f0f0f0", minHeight: "100vh", fontFamily: FONT }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#f0f0f0", borderBottom: "1px solid #ddd", padding: "14px 12px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: "#b8860b" }}>Big Dawg HQ</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "#999" }}>{dateStr}</span>
            <button onClick={() => supabase.auth.signOut()} style={{ fontSize: 10, color: "#999", background: "none", border: "1px solid #ddd", borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>Logout</button>
          </div>
        </div>

        {/* Page nav */}
        <div style={{ display: "flex", gap: 0, marginBottom: 8 }}>
          {(["tasks", "calendar"] as const).map(p => (
            <button key={p} onClick={() => setPage(p)} style={{
              flex: 1, padding: "8px 0", fontSize: 13, fontWeight: page === p ? 700 : 500, cursor: "pointer", fontFamily: FONT,
              border: "none", borderBottom: page === p ? "3px solid #b8860b" : "3px solid transparent",
              background: "transparent", color: page === p ? "#b8860b" : "#999",
            }}>
              {p === "tasks" ? "Tasks" : "Calendar"}
            </button>
          ))}
        </div>

        {/* Category tabs (tasks page only) */}
        {page === "tasks" && (
          <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 10 }}>
            {["All", ...CATS].map(t => {
              const th = THEMES[t] || { accent: "#b8860b" };
              const isActive = activeTab === t;
              return (
                <button key={t} onClick={() => { setActiveTab(t); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  style={{
                    flexShrink: 0, fontSize: 11, padding: "5px 10px", borderRadius: 16, whiteSpace: "nowrap", cursor: "pointer", fontWeight: isActive ? 700 : 400, fontFamily: FONT,
                    border: `1px solid ${isActive ? th.accent : "#ddd"}`, background: isActive ? th.accent : "transparent", color: isActive ? "#fff" : "#888",
                  }}>{t}</button>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary (tasks page) */}
      {page === "tasks" && activeTab === "All" && (
        <div style={{ display: "flex", gap: 6, margin: "12px 12px 8px" }}>
          {[{ n: openCount, l: "Open", c: "#b8860b" }, { n: highCount, l: "High", c: "#dc2626" }, { n: urgentCount, l: "Urgent", c: "#ef4444" }, { n: doneCount, l: "Done", c: "#22c55e" }].map(s => (
            <div key={s.l} style={{ flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 6px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.c }}>{s.n}</div>
              <div style={{ fontSize: 9, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 1 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {page === "tasks" ? (
        <div style={{ marginTop: 8 }}>
          {activeTab === "All" ? CATS.map(c => c === "Bills" ? <BillBlock key={c} /> : <HeadingBlock key={c} cat={c} />) :
           activeTab === "Bills" ? <BillBlock /> : <HeadingBlock cat={activeTab} />}
        </div>
      ) : (
        <CalendarPage />
      )}

      {/* Add bar */}
      {page === "tasks" && (
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 520, padding: "8px 12px", background: "#f0f0f0", borderTop: "1px solid #ddd", zIndex: 50 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={addInput} onChange={e => setAddInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addTask()}
              placeholder="Add task..." style={{ flex: 1, background: "#fff", border: "1px solid #ddd", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: "#1a1a1a", outline: "none", fontFamily: FONT }} />
            <select value={addCat} onChange={e => setAddCat(e.target.value)} style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 10, padding: "8px 6px", fontSize: 11, color: "#666", maxWidth: 95, fontFamily: FONT }}>
              {CATS.filter(c => c !== "Bills").map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={addTask} style={{ background: "#b8860b", border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 18, fontWeight: 700, color: "#fff", cursor: "pointer" }}>+</button>
          </div>
        </div>
      )}

      {/* Modals */}
      {dueModal !== null && (
        <Overlay onClose={() => setDueModal(null)}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{tasks.find(t => t.id === dueModal)?.name || "Set due date"}</h3>
          {[["today", "Due today"], ["tomorrow", "Due tomorrow"], ["week", "Due this week"], ["month", "Due this month"]].map(([k, label]) => (
            <button key={k} onClick={() => { setDue(dueModal, { type: k }); setDueModal(null); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 4, borderRadius: 8, border: "1px solid #e5e7eb", background: "transparent", fontSize: 14, cursor: "pointer", fontFamily: FONT }}>{label}</button>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} style={{ flex: 1, background: "#f9f9f9", border: "1px solid #ddd", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: FONT }} />
            <button onClick={() => { if (customDate) { setDue(dueModal, { type: "custom", date: customDate }); setDueModal(null); } }} style={{ background: "#2563eb", border: "none", borderRadius: 8, padding: "8px 14px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Set</button>
          </div>
          <button onClick={() => { setDue(dueModal, null); setDueModal(null); }} style={{ display: "block", width: "100%", textAlign: "center", padding: 8, marginTop: 8, border: "none", background: "transparent", color: "#dc2626", fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Clear date</button>
          <button onClick={() => setDueModal(null)} style={{ display: "block", width: "100%", textAlign: "center", padding: 6, border: "none", background: "transparent", color: "#999", fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
        </Overlay>
      )}

      {moveModal !== null && (
        <Overlay onClose={() => setMoveModal(null)}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Move: {tasks.find(t => t.id === moveModal)?.name}</h3>
          {CATS.filter(c => c !== "Bills" && c !== tasks.find(t => t.id === moveModal)?.cat).map(c => (
            <button key={c} onClick={() => { moveTask(moveModal, c); setMoveModal(null); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 4, borderRadius: 8, border: "1px solid #e5e7eb", borderLeft: `4px solid ${THEMES[c].accent}`, background: "transparent", fontSize: 14, cursor: "pointer", fontFamily: FONT }}>{c}</button>
          ))}
          <button onClick={() => setMoveModal(null)} style={{ display: "block", width: "100%", textAlign: "center", padding: 8, marginTop: 4, border: "none", background: "transparent", color: "#999", fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
        </Overlay>
      )}

      {deleteConfirm !== null && (
        <Overlay onClose={() => setDeleteConfirm(null)}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Delete task?</p>
            <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>{tasks.find(t => t.id === deleteConfirm)?.name}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #ddd", background: "transparent", fontSize: 14, color: "#666", cursor: "pointer", fontFamily: FONT }}>Cancel</button>
              <button onClick={() => { deleteTask(deleteConfirm); setDeleteConfirm(null); }} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#ef4444", fontSize: 14, color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>Delete</button>
            </div>
          </div>
        </Overlay>
      )}

      {addBillModal && (
        <Overlay onClose={() => setAddBillModal(false)}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Add bill</h3>
          <input value={newBill.name} onChange={e => setNewBill({ ...newBill, name: e.target.value })} placeholder="Bill name" style={{ width: "100%", background: "#f9f9f9", border: "1px solid #ddd", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginBottom: 8, boxSizing: "border-box" as const, fontFamily: FONT }} />
          <input value={newBill.amount} onChange={e => setNewBill({ ...newBill, amount: e.target.value })} placeholder="Amount ($)" type="number" style={{ width: "100%", background: "#f9f9f9", border: "1px solid #ddd", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginBottom: 8, boxSizing: "border-box" as const, fontFamily: FONT }} />
          <select value={newBill.freq} onChange={e => setNewBill({ ...newBill, freq: e.target.value })} style={{ width: "100%", background: "#f9f9f9", border: "1px solid #ddd", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginBottom: 8, fontFamily: FONT }}>
            <option value="Monthly">Monthly</option><option value="Weekly">Weekly</option>
          </select>
          <input value={newBill.day} onChange={e => setNewBill({ ...newBill, day: e.target.value })} placeholder={newBill.freq === "Monthly" ? "Day of month (1-31)" : "Day of week (0=Sun, 4=Thu)"} type="number" style={{ width: "100%", background: "#f9f9f9", border: "1px solid #ddd", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginBottom: 12, boxSizing: "border-box" as const, fontFamily: FONT }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setAddBillModal(false)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #ddd", background: "transparent", fontSize: 14, color: "#666", cursor: "pointer", fontFamily: FONT }}>Cancel</button>
            <button onClick={addBillFn} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#b8860b", fontSize: 14, color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>Add</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}
