export type RedbarkRecord = Record<string, unknown>;

export function sydneyDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function twelveMonthCutoff(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return `${year - 1}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function isRecord(value: unknown): value is RedbarkRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value: unknown, name: string, maximum = 1000): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error(`Invalid ${name}`);
  }
  return value.trim();
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseTransactionEvent(
  payload: unknown,
  allowedAccountIds: ReadonlySet<string>,
  today = sydneyDate(),
) {
  if (!isRecord(payload) || payload.type !== "transactions.synced" ||
      typeof payload.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.id) ||
      !isRecord(payload.data) || !Array.isArray(payload.data.new) ||
      !Array.isArray(payload.data.updated)) {
    throw new Error("Invalid transaction event");
  }
  const candidates = [...payload.data.new, ...payload.data.updated];
  if (candidates.length > 500) throw new Error("Webhook batch exceeds 500 transactions");
  const cutoff = twelveMonthCutoff(today);
  const rows: RedbarkRecord[] = [];
  let ignored = 0;

  for (const value of candidates) {
    if (!isRecord(value)) throw new Error("Invalid transaction");
    const id = requiredText(value.id, "transaction ID", 256);
    const sourceAccountId = requiredText(value.account_id, "source account ID", 128);
    const accountId = requiredText(value.account_public_id, "account ID", 128);
    if (!allowedAccountIds.has(sourceAccountId)) { ignored++; continue; }
    if (value.status !== "posted") { ignored++; continue; }
    if (String(value.currency || "").toUpperCase() !== "AUD") {
      throw new Error("Only AUD transactions are supported by Wealth");
    }
    if (!validDate(value.local_date) || value.local_date > today) {
      throw new Error("Invalid transaction date");
    }
    if (value.local_date < cutoff) { ignored++; continue; }
    if (!Number.isSafeInteger(value.amount) || value.amount === 0) {
      throw new Error("Invalid amount in cents");
    }
    const direction = value.amount < 0 ? "debit" : "credit";
    if (value.direction !== direction) throw new Error("Amount direction mismatch");
    const description = requiredText(value.description, "description");
    const accountName = requiredText(value.account_name, "account name", 256);
    const merchant = typeof value.merchant_name === "string" ? value.merchant_name.trim().slice(0, 256) : "";
    const category = typeof value.custom_category === "string" && value.custom_category.trim()
      ? value.custom_category.trim().slice(0, 256)
      : typeof value.category === "string" ? value.category.trim().slice(0, 256) : "";
    rows.push({
      dedupe_key: `redbark:${accountId}:${id}`,
      transaction_date: value.local_date,
      description,
      merchant_name: merchant || "Unknown",
      amount: Math.abs(value.amount) / 100,
      direction,
      account_source: `${accountName} (${accountId})`,
      category_name: category || "Uncategorised",
      transaction_class: typeof value.class === "string" ? value.class : "other",
      raw: value,
    });
  }
  return { deliveryId: payload.id, rows, ignored };
}

export async function verifySignature(
  body: string,
  timestamp: string | null,
  signature: string | null,
  secret: string,
  nowMs = Date.now(),
): Promise<boolean> {
  if (!timestamp || !/^\d{10}$/.test(timestamp) ||
      Math.abs(nowMs / 1000 - Number(timestamp)) > 300 ||
      !signature || !/^sha256=[0-9a-f]{64}$/i.test(signature)) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key,
    encoder.encode(`${timestamp}.${body}`)));
  const provided = signature.slice(7).match(/../g)!.map((byte) => Number.parseInt(byte, 16));
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ provided[index];
  return difference === 0;
}
