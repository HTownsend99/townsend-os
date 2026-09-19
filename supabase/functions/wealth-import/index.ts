import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type JsonRow = Record<string, unknown>;
type ImportError = { sheet: string; row: number; message: string };

const text = (value: unknown) => String(value ?? "").trim();
const normal = (value: unknown) => text(value).toLowerCase().replace(/\s+/g, " ");
const numberValue = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(text(value).replace(/[$,()]/g, (match) => match === "(" ? "-" : match === ")" ? "" : ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

function dateValue(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const au = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (au) return `${au[3]}-${au[2].padStart(2, "0")}-${au[1].padStart(2, "0")}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function rowsFromSheet(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, raw: true }) as unknown[][];
}

function findHeaderRow(rows: unknown[][], required: string[]) {
  const wanted = required.map(normal);
  return rows.findIndex((row) => {
    const cells = (row || []).map(normal);
    return wanted.every((needle) => cells.some((cell) => cell === needle || cell.includes(needle)));
  });
}

function columnIndex(headers: string[], ...names: string[]) {
  return headers.findIndex((header) => names.some((name) => normal(header) === normal(name)));
}

function rawObject(headers: string[], row: unknown[]) {
  return Object.fromEntries(headers.map((header, index) => [header || `column_${index + 1}`, row[index] instanceof Date ? (row[index] as Date).toISOString() : row[index] ?? null]));
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function expenseClass(budgetCategory: string, category: string, transactionType: string) {
  if (["income", "reimbursement", "transfer", "excluded"].includes(transactionType)) return "non_expense";
  if (transactionType === "investment_property" || budgetCategory === "investment") return "investment_property";
  if (transactionType === "one_off") return "one_off";
  if (transactionType === "subscription" || budgetCategory === "living" || /rent|utilities|insurance|healthcare/i.test(category)) return "fixed";
  return "discretionary";
}

async function fetchAll(client: ReturnType<typeof createClient>, table: string, columns = "*") {
  const rows: JsonRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

function markDuplicateCandidates(records: JsonRow[]) {
  const groups = new Map<string, JsonRow[]>();
  for (const record of records) {
    const key = `${Number(record.amount).toFixed(2)}|${normal(record.description)}`;
    groups.set(key, [...(groups.get(key) || []), record]);
  }
  const candidates = new Set<JsonRow>();
  for (const group of groups.values()) {
    group.sort((a, b) => String(a.transaction_date).localeCompare(String(b.transaction_date)));
    for (let left = 0; left < group.length; left++) for (let right = left + 1; right < group.length; right++) {
      const delta = Math.abs(Date.parse(String(group[right].transaction_date)) - Date.parse(String(group[left].transaction_date)));
      if (delta > 2 * 86400000) break;
      candidates.add(group[left]); candidates.add(group[right]);
    }
  }
  for (const row of candidates) { row.is_duplicate_candidate = true; row.review_status = "pending"; }
  return candidates.size;
}

async function importRecurring(client: ReturnType<typeof createClient>, userId: string, workbook: XLSX.WorkBook, errors: ImportError[]) {
  const sheetName = workbook.SheetNames.find((name) => normal(name) === "subscription_audit");
  if (!sheetName) return 0;
  const rows = rowsFromSheet(workbook.Sheets[sheetName]);
  const headerRow = findHeaderRow(rows, ["item", "est. monthly", "frequency"]);
  if (headerRow < 0) { errors.push({ sheet: sheetName, row: 0, message: "Recurring-cost header row not found" }); return 0; }
  const headers = rows[headerRow].map(text);
  const itemColumn = columnIndex(headers, "item", "name");
  const monthlyColumn = columnIndex(headers, "est. monthly", "estimated monthly");
  const annualColumn = columnIndex(headers, "annualised", "annualized");
  const frequencyColumn = columnIndex(headers, "frequency");
  const amountColumn = columnIndex(headers, "amount", "typical charge");
  const noteColumn = columnIndex(headers, "note", "notes");
  const validFrequency = new Set(["weekly", "fortnightly", "monthly", "quarterly", "annual", "one_off"]);
  const frequencyDays: Record<string, number> = { weekly: 7, fortnightly: 14, monthly: 30, quarterly: 91, annual: 365, one_off: 0 };
  const records: JsonRow[] = [];
  let bucket = "Other fixed costs";
  for (let index = headerRow + 1; index < rows.length; index++) {
    const row = rows[index] || [];
    const name = text(row[itemColumn]);
    if (!name) continue;
    const monthly = Math.abs(numberValue(row[monthlyColumn]));
    const amount = Math.abs(numberValue(row[amountColumn]));
    if (!monthly && !amount && name === name.toUpperCase()) { bucket = name; continue; }
    if (!monthly && !amount || /subtotal|grand total|summary/i.test(name)) continue;
    const rawFrequency = normal(row[frequencyColumn]).replace(/\s+/g, "_");
    const frequency = validFrequency.has(rawFrequency) ? rawFrequency : "monthly";
    const annualised = Math.abs(numberValue(row[annualColumn])) || monthly * 12;
    records.push({ user_id: userId, name, fixed_cost_bucket: bucket, amount: amount || monthly, frequency, frequency_days: frequencyDays[frequency], est_monthly: monthly || annualised / 12, annualised, note: noteColumn >= 0 ? text(row[noteColumn]) : "", status: "review", source_sheet: sheetName });
  }
  if (!records.length) return 0;
  const { error } = await client.from("wealth_recurring_bills").upsert(records, { onConflict: "user_id,name" });
  if (error) { errors.push({ sheet: sheetName, row: headerRow + 2, message: error.message }); return 0; }
  return records.length;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  const authorization = request.headers.get("Authorization");
  if (!authorization) return Response.json({ error: "Unauthorised" }, { status: 401, headers: corsHeaders });
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) return Response.json({ error: "Unauthorised" }, { status: 401, headers: corsHeaders });

  let workbook: XLSX.WorkBook;
  let filename = "upload.xlsx";
  let strategy: "append" | "replace" = "append";
  try {
    const form = await request.formData();
    const file = form.get("file");
    strategy = normal(form.get("dedup_strategy")) === "replace" ? "replace" : "append";
    if (!(file instanceof File) || !/\.xlsx$/i.test(file.name)) return Response.json({ error: "Choose an XLSX workbook" }, { status: 400, headers: corsHeaders });
    if (file.size > 20 * 1024 * 1024) return Response.json({ error: "The workbook exceeds the 20 MB import limit" }, { status: 413, headers: corsHeaders });
    filename = file.name;
    workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
  } catch (error) {
    return Response.json({ error: `Could not read workbook: ${error instanceof Error ? error.message : "unknown error"}` }, { status: 400, headers: corsHeaders });
  }

  const transactionSheet = workbook.SheetNames.find((name) => normal(name) === "transactions") || workbook.SheetNames.find((name) => normal(name).includes("transaction"));
  if (!transactionSheet) return Response.json({ error: "No transactions sheet found" }, { status: 400, headers: corsHeaders });
  const rows = rowsFromSheet(workbook.Sheets[transactionSheet]);
  const headerRow = findHeaderRow(rows, ["transaction_date", "description", "amount", "credit_debit"]);
  if (headerRow < 0) return Response.json({ error: "Transactions header row not found" }, { status: 400, headers: corsHeaders });
  const headers = rows[headerRow].map(text);
  const column = (...names: string[]) => columnIndex(headers, ...names);
  const columns = {
    id: column("transaction_id", "transaction id"), date: column("transaction_date", "posted_date", "date"), description: column("description"), merchant: column("merchant_name"),
    amount: column("amount"), direction: column("credit_debit", "direction"), account: column("account_source", "account"), budget: column("budget_category"),
    category: column("category_name", "category"), subcategory: column("subcategory"), type: column("type", "transaction_type"), day: column("day_of_week"), fortnight: column("fortnight_index"),
  };
  if ([columns.date, columns.description, columns.amount, columns.direction].some((index) => index < 0)) return Response.json({ error: "Transactions sheet is missing required fields" }, { status: 400, headers: corsHeaders });

  const { data: batch, error: batchError } = await client.from("wealth_import_batches").insert({ user_id: user.id, filename, status: "processing", dedup_strategy: strategy, sheets_detected: workbook.SheetNames }).select("id").single();
  if (batchError || !batch) return Response.json({ error: batchError?.message || "Could not create import ledger" }, { status: 500, headers: corsHeaders });

  const errors: ImportError[] = [];
  const mappings = await fetchAll(client, "wealth_merchant_maps");
  const existing = strategy === "append" ? await fetchAll(client, "wealth_transactions", "dedupe_key") : [];
  const existingKeys = new Set(existing.map((row) => String(row.dedupe_key)));
  const occurrences = new Map<string, number>();
  const records: JsonRow[] = [];
  let skipped = 0;
  let deduplicated = 0;

  for (let index = headerRow + 1; index < rows.length; index++) {
    const row = rows[index] || [];
    if (row.every((value) => value == null || value === "")) continue;
    const date = dateValue(row[columns.date]);
    const description = text(row[columns.description]);
    const signedAmount = numberValue(row[columns.amount]);
    if (!date || !description || !signedAmount) { skipped++; errors.push({ sheet: transactionSheet, row: index + 1, message: "Skipped: missing date, description or non-zero amount" }); continue; }
    const amount = Math.abs(signedAmount);
    const account = columns.account >= 0 ? text(row[columns.account]) : "Unknown";
    const sourceId = columns.id >= 0 ? text(row[columns.id]) : "";
    const baseKey = `${date}|${normal(description)}|${amount.toFixed(2)}|${normal(account)}`;
    const occurrence = (occurrences.get(baseKey) || 0) + 1;
    occurrences.set(baseKey, occurrence);
    const dedupeKey = sourceId ? `frollo:${sourceId}` : `workbook:${await digest(`${baseKey}|${occurrence}`)}`;
    if (existingKeys.has(dedupeKey)) { deduplicated++; continue; }
    existingKeys.add(dedupeKey);

    let direction = normal(row[columns.direction]);
    if (!new Set(["debit", "credit"]).has(direction)) direction = signedAmount < 0 ? "debit" : "credit";
    let merchant = columns.merchant >= 0 ? text(row[columns.merchant]) : "Unknown";
    if (!merchant) merchant = "Unknown";
    let budgetCategory = columns.budget >= 0 ? normal(row[columns.budget]) : direction === "credit" ? "income" : "lifestyle";
    if (!["living", "lifestyle", "investment", "income"].includes(budgetCategory)) budgetCategory = direction === "credit" ? "income" : "lifestyle";
    let categoryName = columns.category >= 0 ? text(row[columns.category]) : "Uncategorised";
    let subcategory = columns.subcategory >= 0 ? text(row[columns.subcategory]) : "";
    let transactionType = columns.type >= 0 ? normal(row[columns.type]) : direction === "credit" ? "income" : "expense";
    if (!["expense", "income", "reimbursement", "transfer", "investment_property", "subscription", "one_off", "excluded"].includes(transactionType)) transactionType = direction === "credit" ? "income" : "expense";
    let className = expenseClass(budgetCategory, categoryName, transactionType);
    const haystack = normal(`${description} ${merchant}`);
    const mapping = mappings.find((item) => item.match_text && haystack.includes(normal(item.match_text)));
    if (mapping) {
      merchant = text(mapping.merchant_name) || merchant; budgetCategory = text(mapping.budget_category) || budgetCategory; categoryName = text(mapping.category_name) || categoryName;
      subcategory = text(mapping.subcategory) || subcategory; transactionType = text(mapping.transaction_type) || transactionType; className = text(mapping.expense_class) || className;
    }
    const excluded = transactionType === "excluded" || transactionType === "transfer";
    const unknown = normal(merchant) === "unknown";
    records.push({ user_id: user.id, import_batch_id: batch.id, dedupe_key: dedupeKey, transaction_date: date, description, merchant_name: merchant, amount, direction, account_source: account || "Unknown", budget_category: budgetCategory, category_name: categoryName || "Uncategorised", subcategory, transaction_type: transactionType, expense_class: className, day_of_week: columns.day >= 0 ? text(row[columns.day]) || null : null, fortnight_index: columns.fortnight >= 0 ? text(row[columns.fortnight]) : null, is_excluded: excluded, review_status: excluded ? "excluded" : unknown ? "pending" : "confirmed", source_sheet: transactionSheet, source_row_number: index + 1, raw_row_json: rawObject(headers, row) });
  }

  if (!records.length && !deduplicated) {
    await client.from("wealth_import_batches").update({ status: "failed", rows_skipped: skipped, errors }).eq("id", batch.id);
    return Response.json({ error: "No valid transaction rows found", batch_id: batch.id }, { status: 400, headers: corsHeaders });
  }

  const duplicateCandidates = markDuplicateCandidates(records);
  let imported = 0;
  let insertFailed = false;
  for (let index = 0; index < records.length; index += 100) {
    const chunk = records.slice(index, index + 100);
    const query = strategy === "replace" ? client.from("wealth_transactions").upsert(chunk, { onConflict: "user_id,dedupe_key" }) : client.from("wealth_transactions").insert(chunk);
    const { error } = await query;
    if (error) { insertFailed = true; errors.push({ sheet: transactionSheet, row: headerRow + index + 2, message: error.message }); }
    else imported += chunk.length;
  }

  if (strategy === "replace" && !insertFailed) {
    const { error } = await client.from("wealth_transactions").delete().or(`import_batch_id.neq.${batch.id},import_batch_id.is.null`);
    if (error) { insertFailed = true; errors.push({ sheet: transactionSheet, row: 0, message: `Replacement cleanup failed: ${error.message}` }); }
  }

  const recurringImported = await importRecurring(client, user.id, workbook, errors);
  const dates = records.map((row) => String(row.transaction_date)).sort();
  await client.from("wealth_import_batches").update({ status: insertFailed ? "failed" : "completed", rows_imported: imported, rows_skipped: skipped, rows_deduplicated: deduplicated, duplicate_candidates: duplicateCandidates, recurring_imported: recurringImported, date_from: dates[0] || null, date_to: dates.at(-1) || null, errors }).eq("id", batch.id);

  return Response.json({ success: !insertFailed, batch_id: batch.id, filename, rows_imported: imported, rows_skipped: skipped, rows_deduplicated: deduplicated, duplicate_candidates: duplicateCandidates, recurring_imported: recurringImported, errors }, { status: insertFailed ? 500 : 200, headers: corsHeaders });
});
