import { supabase } from "./supabaseClient";
import type {
  WealthBudget,
  WealthCategory,
  WealthIncome,
  WealthOverview,
  WealthRecurringBill,
  WealthReview,
  WealthReviewTransaction,
  WealthSnapshot,
  WealthTrends,
} from "./wealthTypes";

type Direction = "debit" | "credit";

type WealthTransaction = WealthReviewTransaction & {
  user_id: string;
  direction: Direction;
  account_source?: string;
  budget_category?: string;
  subcategory?: string;
  transaction_type: string;
  expense_class: string;
  is_flagged?: boolean;
  is_duplicate_candidate?: boolean;
  is_excluded?: boolean;
  review_status?: string;
};

type BudgetTarget = {
  id: string;
  month: string;
  category_name: string;
  target_amount: number;
};

export type WealthRange = { from?: string; to?: string };

const round2 = (value: number) => Math.round(value * 100) / 100;
const monthKey = (date: string) => date.slice(0, 7);
const normal = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function weekKey(date: string) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
  return result.toISOString().slice(0, 10);
}

function periodKey(date: string, granularity: "day" | "week" | "month" = "month") {
  if (granularity === "day") return date;
  if (granularity === "week") return weekKey(date);
  return monthKey(date);
}

function isSpend(transaction: WealthTransaction, includeInvestment: boolean) {
  if (transaction.is_excluded || transaction.direction !== "debit") return false;
  if (!["expense", "subscription", "one_off", "investment_property"].includes(transaction.transaction_type)) return false;
  return includeInvestment || transaction.expense_class !== "investment_property";
}

function withinRange(transaction: WealthTransaction, range: WealthRange) {
  return (!range.from || transaction.transaction_date >= range.from) && (!range.to || transaction.transaction_date <= range.to);
}

async function fetchAll<T>(table: string, order = "created_at", ascending = false): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select("*").order(order, { ascending }).range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

function overview(transactions: WealthTransaction[]): WealthOverview {
  const spend = transactions.filter((row) => isSpend(row, false));
  const reimbursements = transactions.filter((row) => !row.is_excluded && row.direction === "credit" && row.transaction_type === "reimbursement");
  const spendByMonth: Record<string, number> = {};
  const reimbursementByMonth: Record<string, number> = {};
  const categoryTotals: Record<string, number> = {};
  const classTotals: Record<string, number> = {};
  for (const row of spend) {
    const month = monthKey(row.transaction_date);
    spendByMonth[month] = (spendByMonth[month] || 0) + row.amount;
    const category = row.category_name || "Uncategorised";
    categoryTotals[category] = (categoryTotals[category] || 0) + row.amount;
    classTotals[row.expense_class || "unclassified"] = (classTotals[row.expense_class || "unclassified"] || 0) + row.amount;
  }
  for (const row of reimbursements) {
    const month = monthKey(row.transaction_date);
    reimbursementByMonth[month] = (reimbursementByMonth[month] || 0) + row.amount;
  }
  const months = Array.from(new Set([...Object.keys(spendByMonth), ...Object.keys(reimbursementByMonth)])).sort();
  const totalSpend = spend.reduce((sum, row) => sum + row.amount, 0);
  const totalReimbursements = reimbursements.reduce((sum, row) => sum + row.amount, 0);
  return {
    total_spend: round2(totalSpend),
    total_reimbursements: round2(totalReimbursements),
    net_spend: round2(totalSpend - totalReimbursements),
    average_transaction: spend.length ? round2(totalSpend / spend.length) : 0,
    transaction_count: spend.length,
    monthly: months.map((month) => ({
      month,
      spend: round2(spendByMonth[month] || 0),
      reimbursements: round2(reimbursementByMonth[month] || 0),
      net_spend: round2((spendByMonth[month] || 0) - (reimbursementByMonth[month] || 0)),
    })),
    top_categories: Object.entries(categoryTotals).map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount).slice(0, 10),
    by_expense_class: Object.entries(classTotals).map(([expense_class, amount]) => ({ expense_class, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
  };
}

function trends(transactions: WealthTransaction[], includeInvestment = false, expenseClass?: string): WealthTrends {
  let spend = transactions.filter((row) => isSpend(row, includeInvestment || expenseClass === "investment_property"));
  if (expenseClass) spend = spend.filter((row) => row.expense_class === expenseClass);
  const totals: Record<string, number> = {};
  const classes: Record<string, Record<string, number>> = {};
  const categories: Record<string, Record<string, number>> = {};
  for (const row of spend) {
    const period = periodKey(row.transaction_date);
    totals[period] = (totals[period] || 0) + row.amount;
    (classes[row.expense_class] ||= {})[period] = (classes[row.expense_class][period] || 0) + row.amount;
    const category = row.category_name || "Uncategorised";
    (categories[category] ||= {})[period] = (categories[category][period] || 0) + row.amount;
  }
  const periods = Object.keys(totals).sort();
  const series = (values: Record<string, number>) => periods.map((period) => round2(values[period] || 0));
  return {
    granularity: "month",
    periods,
    total_series: series(totals),
    by_class: Object.fromEntries(Object.entries(classes).map(([key, values]) => [key, series(values)])),
    by_category: Object.fromEntries(Object.entries(categories).map(([key, values]) => [key, series(values)])),
  };
}

function categories(transactions: WealthTransaction[], includeInvestment: boolean): WealthCategory[] {
  const tree: Record<string, { amount: number; count: number; subcategories: Record<string, { amount: number; count: number; merchants: Record<string, { amount: number; count: number; transactions: Array<{ id: string; date: string; description: string; amount: number }> }> }> }> = {};
  for (const row of transactions.filter((item) => isSpend(item, includeInvestment))) {
    const category = row.category_name || "Uncategorised";
    const subcategory = row.subcategory || "Unspecified";
    const merchant = row.merchant_name || "Unknown";
    const categoryNode = tree[category] ||= { amount: 0, count: 0, subcategories: {} };
    categoryNode.amount += row.amount; categoryNode.count++;
    const subcategoryNode = categoryNode.subcategories[subcategory] ||= { amount: 0, count: 0, merchants: {} };
    subcategoryNode.amount += row.amount; subcategoryNode.count++;
    const merchantNode = subcategoryNode.merchants[merchant] ||= { amount: 0, count: 0, transactions: [] };
    merchantNode.amount += row.amount; merchantNode.count++;
    merchantNode.transactions.push({ id: row.id, date: row.transaction_date, description: row.description, amount: round2(row.amount) });
  }
  return Object.entries(tree).map(([category, node]) => ({
    category, amount: round2(node.amount), count: node.count,
    subcategories: Object.entries(node.subcategories).map(([subcategory, subNode]) => ({
      subcategory, amount: round2(subNode.amount), count: subNode.count,
      merchants: Object.entries(subNode.merchants).map(([merchant, merchantNode]) => ({ merchant, amount: round2(merchantNode.amount), count: merchantNode.count, transactions: merchantNode.transactions })).sort((a, b) => b.amount - a.amount),
    })).sort((a, b) => b.amount - a.amount),
  })).sort((a, b) => b.amount - a.amount);
}

function income(transactions: WealthTransaction[]): WealthIncome {
  const incomeRows = transactions.filter((row) => !row.is_excluded && row.direction === "credit" && row.transaction_type === "income");
  const reimbursements = transactions.filter((row) => !row.is_excluded && row.direction === "credit" && row.transaction_type === "reimbursement");
  const expenses = transactions.filter((row) => isSpend(row, true));
  const bySource: Record<string, { amount: number; count: number }> = {};
  const incomeByMonth: Record<string, number> = {};
  const reimbursementByMonth: Record<string, number> = {};
  const expenseByMonth: Record<string, number> = {};
  for (const row of incomeRows) {
    const source = row.category_name || "Other income";
    const node = bySource[source] ||= { amount: 0, count: 0 };
    node.amount += row.amount; node.count++;
    incomeByMonth[monthKey(row.transaction_date)] = (incomeByMonth[monthKey(row.transaction_date)] || 0) + row.amount;
  }
  for (const row of reimbursements) reimbursementByMonth[monthKey(row.transaction_date)] = (reimbursementByMonth[monthKey(row.transaction_date)] || 0) + row.amount;
  for (const row of expenses) expenseByMonth[monthKey(row.transaction_date)] = (expenseByMonth[monthKey(row.transaction_date)] || 0) + row.amount;
  const months = Array.from(new Set([...Object.keys(incomeByMonth), ...Object.keys(reimbursementByMonth), ...Object.keys(expenseByMonth)])).sort();
  const totalIncome = incomeRows.reduce((sum, row) => sum + row.amount, 0);
  const totalReimbursements = reimbursements.reduce((sum, row) => sum + row.amount, 0);
  return {
    total_income: round2(totalIncome), total_reimbursements: round2(totalReimbursements), total_inflows: round2(totalIncome + totalReimbursements),
    salary_income: round2(incomeRows.filter((row) => /salary|regular income/i.test(row.category_name || "")).reduce((sum, row) => sum + row.amount, 0)),
    rental_income: round2(incomeRows.filter((row) => /investment property.*rental income|rental income/i.test(row.category_name || "")).reduce((sum, row) => sum + row.amount, 0)),
    by_source: Object.entries(bySource).map(([source, value]) => ({ source, amount: round2(value.amount), count: value.count })).sort((a, b) => b.amount - a.amount),
    monthly: months.map((month) => ({ month, income: round2(incomeByMonth[month] || 0), reimbursements: round2(reimbursementByMonth[month] || 0), expenses: round2(expenseByMonth[month] || 0), net_cashflow: round2((incomeByMonth[month] || 0) + (reimbursementByMonth[month] || 0) - (expenseByMonth[month] || 0)) })),
  };
}

function budget(transactions: WealthTransaction[], targets: BudgetTarget[], month: string): WealthBudget {
  const actualByCategory: Record<string, number> = {};
  for (const row of transactions.filter((item) => isSpend(item, false) && monthKey(item.transaction_date) === month)) {
    const category = row.category_name || "Uncategorised";
    actualByCategory[category] = (actualByCategory[category] || 0) + row.amount;
  }
  const targetByCategory = Object.fromEntries(targets.filter((target) => target.month === month).map((target) => [target.category_name, Number(target.target_amount)]));
  const rows = Array.from(new Set([...Object.keys(actualByCategory), ...Object.keys(targetByCategory)])).map((category) => {
    const target = targetByCategory[category] || 0;
    const actual = actualByCategory[category] || 0;
    return { category, target: round2(target), actual: round2(actual), remaining: round2(target - actual), percent_used: target ? round2(actual / target * 100) : null, status: !target ? "not_set" : actual > target ? "over" : "under" };
  }).sort((a, b) => b.actual - a.actual);
  return { total_target: round2(Object.values(targetByCategory).reduce((sum, value) => sum + value, 0)), total_actual: round2(Object.values(actualByCategory).reduce((sum, value) => sum + value, 0)), rows };
}

function transactionView(row: WealthTransaction): WealthReviewTransaction {
  return { id: row.id, transaction_date: row.transaction_date, description: row.description, merchant_name: row.merchant_name, amount: Number(row.amount), category_name: row.category_name, suggested_category: row.suggested_category, suggestion_confidence: row.suggestion_confidence, review_note: row.review_note, flag_reason: row.flag_reason };
}

function review(transactions: WealthTransaction[]): WealthReview {
  const unknown = transactions.filter((row) => !row.is_excluded && (!row.merchant_name || normal(row.merchant_name) === "unknown") && row.review_status === "pending").map(transactionView);
  const flagged = transactions.filter((row) => row.is_flagged && row.review_status !== "confirmed").map(transactionView);
  const groups = new Map<string, WealthTransaction[]>();
  for (const row of transactions.filter((item) => !item.is_excluded)) {
    const key = `${Number(row.amount).toFixed(2)}|${normal(row.description)}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const duplicates: WealthReviewTransaction[][] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    for (let left = 0; left < group.length; left++) for (let right = left + 1; right < group.length; right++) {
      const delta = Math.abs(Date.parse(group[right].transaction_date) - Date.parse(group[left].transaction_date));
      if (delta > 2 * 86400000) break;
      duplicates.push([transactionView(group[left]), transactionView(group[right])]);
    }
  }
  return { summary: { unknown_count: unknown.length, flagged_count: flagged.length, duplicate_pairs: duplicates.length }, unknown_merchants: unknown, flagged, duplicate_candidates: duplicates };
}

export async function loadWealthSnapshot(range: WealthRange, budgetMonth: string): Promise<WealthSnapshot> {
  const [allTransactions, recurring, targets] = await Promise.all([
    fetchAll<WealthTransaction>("wealth_transactions", "transaction_date", false),
    fetchAll<WealthRecurringBill>("wealth_recurring_bills", "annualised", false),
    fetchAll<BudgetTarget>("wealth_budget_targets", "month", true),
  ]);
  const ranged = allTransactions.filter((row) => withinRange(row, range));
  return {
    overview: overview(ranged), trends: trends(ranged), categories: categories(ranged, false), allCategories: categories(ranged, true),
    income: income(ranged), propertyTrends: trends(ranged, true, "investment_property"), recurring,
    review: review(allTransactions), budget: budget(allTransactions, targets, budgetMonth),
  };
}

export async function updateRecurringStatus(id: string, status: WealthRecurringBill["status"]) {
  const { error } = await supabase.from("wealth_recurring_bills").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function saveBudgetTarget(userId: string, month: string, category: string, target: number) {
  const { error } = await supabase.from("wealth_budget_targets").upsert({ user_id: userId, budget_key: `${month}|${category}`, month, category_name: category, target_amount: target }, { onConflict: "user_id,budget_key" });
  if (error) throw error;
}

export async function resolveMerchant(userId: string, transaction: WealthReviewTransaction, merchant: string, category: string) {
  const patch = { merchant_name: merchant.trim(), category_name: category, budget_category: "lifestyle", expense_class: "discretionary", transaction_type: "expense", review_status: "amended" };
  const { error: transactionError } = await supabase.from("wealth_transactions").update(patch).eq("id", transaction.id);
  if (transactionError) throw transactionError;
  const matchText = normal(merchant);
  const { error: mappingError } = await supabase.from("wealth_merchant_maps").upsert({ user_id: userId, match_text: matchText, merchant_name: patch.merchant_name, category_name: patch.category_name, budget_category: patch.budget_category, expense_class: patch.expense_class, transaction_type: patch.transaction_type }, { onConflict: "user_id,match_text" });
  if (mappingError) throw mappingError;
}

export async function excludeDuplicate(excludeId: string, keepId?: string) {
  const { error } = await supabase.from("wealth_transactions").update({ is_excluded: true, transaction_type: "excluded", expense_class: "non_expense", review_status: "excluded", flag_reason: "Excluded as duplicate after review" }).eq("id", excludeId);
  if (error) throw error;
  if (keepId) {
    const { error: keepError } = await supabase.from("wealth_transactions").update({ is_duplicate_candidate: false, review_status: "confirmed" }).eq("id", keepId);
    if (keepError) throw keepError;
  }
}

export async function importWealthWorkbook(file: File, strategy: "append" | "replace") {
  const body = new FormData();
  body.append("file", file);
  body.append("dedup_strategy", strategy);
  const { data, error } = await supabase.functions.invoke("wealth-import", { body });
  if (error) {
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      let payload: { error?: unknown } | null = null;
      try {
        payload = await response.clone().json() as { error?: unknown };
      } catch { /* Fall back to the SDK error when the response is not JSON. */ }
      if (typeof payload?.error === "string" && payload.error.trim()) throw new Error(payload.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
