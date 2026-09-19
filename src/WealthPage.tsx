import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "./Icon";
import {
  excludeDuplicate,
  importWealthWorkbook,
  loadWealthSnapshot,
  resolveMerchant,
  saveBudgetTarget,
  updateRecurringStatus,
} from "./wealthService";
import { WEALTH_PREVIEW } from "./wealthPreview";
import type {
  WealthBudget,
  WealthCategory,
  WealthReviewTransaction,
  WealthSnapshot,
  WealthView,
} from "./wealthTypes";
import "./WealthPage.css";

const VIEWS: Array<{ id: WealthView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "trends", label: "Trends" },
  { id: "categories", label: "Categories" },
  { id: "income", label: "Income" },
  { id: "property", label: "Property" },
  { id: "recurring", label: "Fixed costs" },
  { id: "budgets", label: "Budgets" },
  { id: "review", label: "Review" },
  { id: "import", label: "Import" },
];

const CATEGORIES = [
  "Groceries", "Takeaway & snacks", "Restaurants", "Cafes & coffee", "Bars & pubs",
  "Rent paid", "Utilities", "Healthcare and medical", "Public transport",
  "Entertainment and recreation", "Subscriptions and renewals", "Clothing and shoes",
  "Insurance", "Travel and holidays", "Other expenses",
];

const money = (value = 0, precise = false) => new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: precise ? 2 : 0,
  maximumFractionDigits: precise ? 2 : 0,
}).format(value);

const dateLabel = (value?: string) => value
  ? new Date(`${value}T00:00:00`).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })
  : "Not available";

const titleCase = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const errorText = (error: unknown) => error instanceof Error ? error.message : "The Wealth data source could not complete that request.";

function SourceNote({ preview }: { preview: boolean }) {
  return <span className="wealth-source">{preview ? "Preview data" : "Townsend OS data"} · owner only</span>;
}

function EmptyWealth({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="wealth-empty"><Icon name="database" size={25} /><h2>{title}</h2><p>{children}</p></div>;
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "good" | "warning" }) {
  return <div className="wealth-metric"><span className="overline">{label}</span><strong>{value}</strong><small className={tone ? `metric-${tone}` : ""}>{note}</small></div>;
}

function BarChart({ rows, primary = "spend", secondary, height = 250 }: {
  rows: Array<Record<string, string | number>>;
  primary?: string;
  secondary?: string;
  height?: number;
}) {
  const max = Math.max(1, ...rows.flatMap((row) => [Number(row[primary] || 0), secondary ? Number(row[secondary] || 0) : 0]));
  return <div className="wealth-bars" style={{ height }} role="img" aria-label="Financial values by period">
    {rows.map((row, index) => <div className="wealth-bar-group" key={`${row.label}-${index}`}>
      <div className="wealth-bar-plot">
        <span className="wealth-bar primary" style={{ height: `${Math.max(3, Number(row[primary] || 0) / max * 100)}%` }} title={money(Number(row[primary] || 0))} />
        {secondary && <span className="wealth-bar secondary" style={{ height: `${Math.max(3, Number(row[secondary] || 0) / max * 100)}%` }} title={money(Number(row[secondary] || 0))} />}
      </div>
      <span className="wealth-axis-label">{String(row.label)}</span>
    </div>)}
  </div>;
}

function Overview({ data, preview }: { data: WealthSnapshot; preview: boolean }) {
  const overview = data.overview;
  const chartRows = overview.monthly.map((row) => ({ label: row.month.slice(5) + "/" + row.month.slice(2, 4), spend: row.spend, net: row.net_spend }));
  const mixTotal = overview.by_expense_class.reduce((sum, row) => sum + row.amount, 0) || 1;
  return <>
    <div className="wealth-metrics" aria-label="Spending summary">
      <Metric label="Net spend" value={money(overview.net_spend, true)} note="After reimbursements" tone="good" />
      <Metric label="Gross spending" value={money(overview.total_spend, true)} note={`${overview.transaction_count} debit transactions`} />
      <Metric label="Reimbursements" value={money(overview.total_reimbursements, true)} note="Money returned to you" tone="good" />
      <Metric label="Average transaction" value={money(overview.average_transaction, true)} note="Across personal expenses" />
    </div>
    <div className="wealth-overview-grid">
      <section className="wealth-panel">
        <div className="wealth-panel-head"><div><h2>Monthly spending</h2><p>Gross and net spending in AUD</p></div><div className="wealth-legend"><span><i className="legend-ink" />Gross</span><span><i className="legend-pine" />Net</span></div></div>
        <BarChart rows={chartRows} primary="spend" secondary="net" />
      </section>
      <section className="wealth-panel">
        <div className="wealth-panel-head"><div><h2>Spending mix</h2><p>Share of net spending</p></div></div>
        <div className="wealth-mix-bar">{overview.by_expense_class.map((row, index) => <span key={row.expense_class} className={`mix-${index}`} style={{ width: `${row.amount / mixTotal * 100}%` }} />)}</div>
        <div className="wealth-mix-list">{overview.by_expense_class.map((row, index) => <div key={row.expense_class}><i className={`mix-dot mix-${index}`} /><span>{titleCase(row.expense_class)}</span><strong>{money(row.amount, true)}</strong><small>{Math.round(row.amount / mixTotal * 100)}%</small></div>)}</div>
      </section>
    </div>
    <section className="wealth-panel wealth-categories-panel">
      <div className="wealth-panel-head"><div><h2>Top categories</h2><p>By net spend for the selected period</p></div><SourceNote preview={preview} /></div>
      <div className="wealth-table" role="table">
        <div className="wealth-table-head wealth-category-row" role="row"><span>#</span><span>Category</span><span>Net spend</span><span>Share</span></div>
        {overview.top_categories.map((row, index) => <div className="wealth-category-row" role="row" key={row.category}><span>{index + 1}</span><strong>{row.category}</strong><span>{money(row.amount, true)}</span><span>{Math.round(row.amount / Math.max(overview.net_spend, 1) * 100)}%</span></div>)}
      </div>
    </section>
  </>;
}

function Trends({ data }: { data: WealthSnapshot }) {
  const rows = data.trends.periods.map((period, index) => ({ label: period.slice(5) + "/" + period.slice(2, 4), spend: data.trends.total_series[index] || 0 }));
  return <section className="wealth-panel wealth-wide-panel"><div className="wealth-panel-head"><div><h2>Spending trends</h2><p>Personal spending across the selected period.</p></div></div>{rows.length ? <BarChart rows={rows} height={360} /> : <EmptyWealth title="No trend data">Import transactions to reveal spending patterns over time.</EmptyWealth>}</section>;
}

function Categories({ categories }: { categories: WealthCategory[] }) {
  const [open, setOpen] = useState<string | null>(categories[0]?.category ?? null);
  if (!categories.length) return <EmptyWealth title="No category data">Import transactions before analysing categories.</EmptyWealth>;
  return <section className="wealth-panel wealth-wide-panel"><div className="wealth-panel-head"><div><h2>Category analysis</h2><p>Expand a category to trace spending to merchants.</p></div></div><div className="wealth-accordion">{categories.map((category) => <div key={category.category} className="wealth-accordion-item"><button onClick={() => setOpen(open === category.category ? null : category.category)} aria-expanded={open === category.category}><span><strong>{category.category}</strong><small>{category.count} transactions</small></span><span>{money(category.amount, true)} <Icon name="chevron-down" size={16} /></span></button>{open === category.category && <div className="wealth-accordion-body">{category.subcategories.map((sub) => <div key={sub.subcategory}><div><strong>{sub.subcategory}</strong><span>{money(sub.amount, true)}</span></div>{sub.merchants.slice(0, 8).map((merchant) => <p key={merchant.merchant}><span>{merchant.merchant} · {merchant.count}</span><span>{money(merchant.amount, true)}</span></p>)}</div>)}</div>}</div>)}</div></section>;
}

function Income({ data }: { data: WealthSnapshot }) {
  const income = data.income;
  const rows = income.monthly.map((row) => ({ label: row.month.slice(5) + "/" + row.month.slice(2, 4), income: row.income, expenses: row.expenses }));
  return <><div className="wealth-metrics"><Metric label="Total income" value={money(income.total_income)} note="Excludes reimbursements" /><Metric label="Salary" value={money(income.salary_income)} note="Employment income" /><Metric label="Rental income" value={money(income.rental_income)} note="Investment property" /><Metric label="Reimbursements" value={money(income.total_reimbursements)} note="Tracked separately" /></div><section className="wealth-panel wealth-wide-panel"><div className="wealth-panel-head"><div><h2>Income versus expenses</h2><p>Monthly cash movement in AUD</p></div><div className="wealth-legend"><span><i className="legend-ink" />Income</span><span><i className="legend-warning" />Expenses</span></div></div><BarChart rows={rows} primary="income" secondary="expenses" height={330} /></section></>;
}

function Property({ data }: { data: WealthSnapshot }) {
  const expenses = data.propertyTrends.total_series.reduce((sum, value) => sum + value, 0);
  const rows = data.propertyTrends.periods.map((period, index) => ({ label: period.slice(5) + "/" + period.slice(2, 4), expenses: data.propertyTrends.total_series[index] || 0 }));
  return <><div className="wealth-metrics three"><Metric label="Rental income" value={money(data.income.rental_income)} note="Recorded property income" /><Metric label="Property expenses" value={money(expenses)} note="Ownership and maintenance" /><Metric label="Period cash result" value={money(data.income.rental_income - expenses)} note="Income less recorded costs" tone={data.income.rental_income >= expenses ? "good" : "warning"} /></div><section className="wealth-panel wealth-wide-panel"><div className="wealth-panel-head"><div><h2>Property costs over time</h2><p>Kept separate from personal spending.</p></div></div><BarChart rows={rows} primary="expenses" height={330} /></section></>;
}

function Recurring({ data, preview, reload, notify }: { data: WealthSnapshot; preview: boolean; reload: () => Promise<void>; notify: (message: string, error?: boolean) => void }) {
  const monthly = data.recurring.reduce((sum, bill) => sum + (bill.est_monthly || 0), 0);
  const update = async (id: string, status: string) => {
    if (preview) return notify("Status updated in preview.");
    try { await updateRecurringStatus(id, status as "confirmed" | "review" | "cancel"); await reload(); notify("Fixed-cost status updated."); }
    catch (error) { notify(errorText(error), true); }
  };
  return <><div className="wealth-metrics three"><Metric label="Tracked costs" value={String(data.recurring.length)} note="Recurring items" /><Metric label="Monthly run rate" value={money(monthly)} note="Estimated monthly cost" /><Metric label="Annualised" value={money(monthly * 12)} note="Estimated annual cost" /></div><section className="wealth-panel wealth-wide-panel"><div className="wealth-panel-head"><div><h2>Fixed costs</h2><p>Review recurring commitments and subscriptions.</p></div></div><div className="wealth-fixed-list">{data.recurring.map((bill) => <article key={bill.id}><div><strong>{bill.name}</strong><p>{bill.fixed_cost_bucket || titleCase(bill.frequency)} · next {dateLabel(bill.next_charge_date)}</p></div><span>{money(bill.est_monthly || bill.amount, true)}<small>per month</small></span><select value={bill.status} onChange={(event) => update(bill.id, event.target.value)} aria-label={`Status for ${bill.name}`}><option value="confirmed">Confirmed</option><option value="review">Review</option><option value="cancel">Cancel</option></select></article>)}</div></section></>;
}

function Budgets({ data, preview, reload, notify, month, userId }: { data: WealthSnapshot; preview: boolean; reload: () => Promise<void>; notify: (message: string, error?: boolean) => void; month: string; userId: string }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const save = async (row: WealthBudget["rows"][number]) => {
    const target = Number(edits[row.category] ?? row.target);
    if (!Number.isFinite(target) || target < 0) return notify("Enter a valid budget amount.", true);
    if (preview) return notify("Budget updated in preview.");
    try {
      await saveBudgetTarget(userId, month, row.category, target);
      await reload(); notify("Budget target saved.");
    } catch (error) { notify(errorText(error), true); }
  };
  return <><div className="wealth-metrics three"><Metric label="Budget" value={money(data.budget.total_target)} note={month} /><Metric label="Actual" value={money(data.budget.total_actual)} note="Recorded spend" /><Metric label="Remaining" value={money(data.budget.total_target - data.budget.total_actual)} note="Across budgeted categories" tone="good" /></div><section className="wealth-panel wealth-wide-panel"><div className="wealth-panel-head"><div><h2>Budget versus actual</h2><p>Set category targets, then monitor what remains.</p></div></div><div className="wealth-budget-list">{data.budget.rows.map((row) => <article key={row.category}><div><strong>{row.category}</strong><small>{money(row.actual)} used</small></div><div className="wealth-progress"><span style={{ width: `${Math.min(100, row.percent_used || 0)}%` }} className={row.status === "over" ? "over" : ""} /></div><span className={row.remaining < 0 ? "negative" : ""}>{money(row.remaining)}</span><input type="number" min="0" step="10" value={edits[row.category] ?? row.target} onChange={(event) => setEdits((current) => ({ ...current, [row.category]: event.target.value }))} aria-label={`Budget for ${row.category}`} /><button className="button secondary" onClick={() => save(row)}>Save</button></article>)}</div></section></>;
}

function Review({ data, preview, reload, notify, userId }: { data: WealthSnapshot; preview: boolean; reload: () => Promise<void>; notify: (message: string, error?: boolean) => void; userId: string }) {
  const [tab, setTab] = useState<"unknown" | "flagged" | "duplicates">("unknown");
  const [editing, setEditing] = useState<WealthReviewTransaction | null>(null);
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("");
  const edit = (row: WealthReviewTransaction) => { setEditing(row); setMerchant(row.merchant_name || ""); setCategory(row.category_name || row.suggested_category || ""); };
  const resolve = async () => {
    if (!editing || !merchant.trim() || !category) return notify("Add a merchant and category before saving.", true);
    if (preview) { setEditing(null); return notify("Mapping saved in preview."); }
    try {
      await resolveMerchant(userId, editing, merchant, category);
      setEditing(null); await reload(); notify("Merchant mapping saved.");
    } catch (error) { notify(errorText(error), true); }
  };
  const rows = tab === "unknown" ? data.review.unknown_merchants || [] : tab === "flagged" ? data.review.flagged || [] : [];
  return <><div className="wealth-metrics three"><Metric label="Unknown merchants" value={String(data.review.summary.unknown_count)} note="Need a mapping" /><Metric label="Flagged" value={String(data.review.summary.flagged_count)} note="Need a decision" tone="warning" /><Metric label="Duplicate pairs" value={String(data.review.summary.duplicate_pairs)} note="Need comparison" /></div><div className="wealth-review-tabs" role="tablist"><button className={tab === "unknown" ? "active" : ""} onClick={() => setTab("unknown")}>Unknown merchants ({data.review.summary.unknown_count})</button><button className={tab === "flagged" ? "active" : ""} onClick={() => setTab("flagged")}>Flagged ({data.review.summary.flagged_count})</button><button className={tab === "duplicates" ? "active" : ""} onClick={() => setTab("duplicates")}>Possible duplicates ({data.review.summary.duplicate_pairs})</button></div><section className="wealth-panel wealth-review-panel">
    {tab !== "duplicates" ? <div className="wealth-review-table"><div className="wealth-review-row head"><span>Date</span><span>Description</span><span>Amount</span><span>Merchant</span><span>Category</span><span>Action</span></div>{rows.map((row) => <div className={`wealth-review-row${editing?.id === row.id ? " editing" : ""}`} key={row.id}><span>{dateLabel(row.transaction_date)}</span><strong>{row.description}</strong><span>{money(row.amount, true)}</span>{editing?.id === row.id ? <><input value={merchant} onChange={(event) => setMerchant(event.target.value)} aria-label="Merchant name" /><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category"><option value="">Select category</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select><div><button className="button" onClick={resolve}>Save mapping</button><button className="button secondary" onClick={() => setEditing(null)}>Cancel</button></div></> : <><span className="muted">{row.merchant_name || "Unknown merchant"}</span><span className="muted">{row.category_name || row.flag_reason || "Select category"}</span><button className="button secondary" onClick={() => edit(row)}>{tab === "flagged" ? "Review" : "Map"}</button></>}</div>)}</div> : <div className="wealth-duplicates">{data.review.duplicate_candidates?.length ? data.review.duplicate_candidates.map((pair, index) => <article key={index}><div><strong>{pair[0].description}</strong><p>{pair.map((item) => `${dateLabel(item.transaction_date)} · ${money(item.amount, true)}`).join(" versus ")}</p></div><button className="button danger" onClick={async () => { if (preview) return notify("Duplicate resolved in preview."); try { await excludeDuplicate(pair[1].id, pair[0].id); await reload(); notify("Duplicate excluded."); } catch (error) { notify(errorText(error), true); } }}>Exclude second</button></article>) : <EmptyWealth title="No duplicate candidates">No transactions currently require duplicate review.</EmptyWealth>}</div>}
    <div className="wealth-panel-foot"><SourceNote preview={preview} /></div>
  </section></>;
}

function ImportData({ preview, reload, notify }: { preview: boolean; reload: () => Promise<void>; notify: (message: string, error?: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState<"append" | "replace">("append");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return notify("Choose an XLSX workbook first.", true);
    if (preview) return notify("Workbook checked in preview. No data was uploaded.");
    setBusy(true);
    try { await importWealthWorkbook(file, strategy); await reload(); notify("Workbook imported."); setFile(null); }
    catch (error) { notify(errorText(error), true); }
    finally { setBusy(false); }
  };
  return <div className="wealth-import-grid"><form className="wealth-panel wealth-import" onSubmit={submit}><label><Icon name="upload" size={28} /><strong>{file ? file.name : "Choose an XLSX workbook"}</strong><span>{file ? `${Math.round(file.size / 1024)} KB ready to import` : "Select the cleaned Frollo workbook from your computer"}</span><input type="file" accept=".xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><div><select value={strategy} onChange={(event) => setStrategy(event.target.value as "append" | "replace")} aria-label="Import behaviour"><option value="append">Append and deduplicate</option><option value="replace">Replace existing data</option></select><button className="button" disabled={!file || busy}>{busy ? "Importing…" : "Import workbook"}</button></div></form><aside className="wealth-panel wealth-import-notes"><h2>What happens</h2><ol><li>Required transaction fields are validated.</li><li>Existing transaction identities are checked.</li><li>Saved merchant mappings are applied.</li><li>Import counts and source rows remain auditable.</li></ol><p>Replace keeps the existing records until the new workbook has been written successfully. Use append for normal monthly imports.</p></aside></div>;
}

export function WealthPage({ preview, userId, onToast }: { preview: boolean; userId: string; onToast: (toast: { message: string; error?: boolean } | null) => void }) {
  const [view, setView] = useState<WealthView>("overview");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WealthSnapshot | null>(preview ? WEALTH_PREVIEW : null);
  const [preset, setPreset] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const notify = (message: string, error = false) => onToast({ message, error });
  const budgetMonth = to.slice(0, 7) || new Date().toISOString().slice(0, 7);

  const load = useCallback(async () => {
    if (preview) { setData(WEALTH_PREVIEW); return; }
    setLoading(true);
    const range = { from: from || undefined, to: to || undefined };
    try {
      setData(await loadWealthSnapshot(range, budgetMonth));
    } catch (error) { notify(errorText(error), true); }
    finally { setLoading(false); }
  }, [preview, from, to, budgetMonth]);

  useEffect(() => { if (!data) void load(); }, [data, load]);

  const applyPreset = (value: string) => {
    setPreset(value);
    const today = new Date();
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    let nextFrom = "";
    let nextTo = "";
    if (value === "this_month") { nextFrom = iso(new Date(today.getFullYear(), today.getMonth(), 1)); nextTo = iso(today); }
    if (value === "last_3") { nextFrom = iso(new Date(today.getFullYear(), today.getMonth() - 2, 1)); nextTo = iso(today); }
    if (value === "fytd") { const year = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1; nextFrom = `${year}-07-01`; nextTo = iso(today); }
    setFrom(nextFrom); setTo(nextTo); setData(null);
  };

  const heading = useMemo(() => ({
    overview: ["Wealth", "Spending, income and commitments in one private view."],
    trends: ["Spending trends", "See how personal spending changes over time."],
    categories: ["Category analysis", "Trace spending from categories to merchants."],
    income: ["Income", "Keep earnings, rent and reimbursements distinct."],
    property: ["Investment property", "Separate property cash flow from personal spending."],
    recurring: ["Fixed costs", "Review recurring commitments and subscriptions."],
    budgets: ["Budgets", "Set category targets and monitor what remains."],
    review: ["Review transactions", "Resolve unknown merchants, flagged items and possible duplicates before they affect reporting."],
    import: ["Import workbook", "Append the latest cleaned financial data with an audit trail."],
  }[view]), [view]);

  return <main className="wealth-page">
    <nav className="wealth-tabs" aria-label="Wealth sections">{VIEWS.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined}>{item.label}{item.id === "review" && data && data.review.summary.unknown_count + data.review.summary.flagged_count > 0 ? <span>{data.review.summary.unknown_count + data.review.summary.flagged_count}</span> : null}</button>)}</nav>
    <div className="wealth-content">
      <div className="wealth-heading"><div><h1>{heading[0]}</h1><p>{heading[1]}</p></div>{!(["review", "import"] as WealthView[]).includes(view) && <div className="wealth-filters"><select value={preset} onChange={(event) => applyPreset(event.target.value)} aria-label="Period"><option value="">Custom range</option><option value="this_month">This month</option><option value="last_3">Last 3 months</option><option value="fytd">FY to date</option><option value="all">All time</option></select><label>From<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPreset(""); setData(null); }} /></label><label>To<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPreset(""); setData(null); }} /></label><button className="button secondary icon-only" onClick={() => load()} disabled={loading} aria-label="Refresh Wealth"><Icon name="refresh-cw" /></button><button className="button" onClick={() => setView("import")}><Icon name="upload" size={17} /> Import</button></div>}</div>
      {loading && !data ? <div className="loading-state"><span className="spinner" /> Loading Wealth…</div> : data ? <>
        {view === "overview" && <Overview data={data} preview={preview} />}
        {view === "trends" && <Trends data={data} />}
        {view === "categories" && <Categories categories={data.categories} />}
        {view === "income" && <Income data={data} />}
        {view === "property" && <Property data={data} />}
        {view === "recurring" && <Recurring data={data} preview={preview} reload={load} notify={notify} />}
        {view === "budgets" && <Budgets data={data} preview={preview} reload={load} notify={notify} month={budgetMonth} userId={userId} />}
        {view === "review" && <Review data={data} preview={preview} reload={load} notify={notify} userId={userId} />}
        {view === "import" && <ImportData preview={preview} reload={load} notify={notify} />}
      </> : <EmptyWealth title="Wealth data is unavailable">Check the Townsend OS database and try again.</EmptyWealth>}
    </div>
  </main>;
}

export default WealthPage;
