import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { parseTransactionEvent, twelveMonthCutoff, verifySignature } from "../supabase/functions/redbark-webhook/validate.ts";

const transaction = {
  id: "bank-123", amount: -4550, currency: "aud", status: "posted",
  description: "Woolworths Sydney", direction: "debit", class: "payment",
  account_id: "254c6967-ea62-4f0c-bb64-b2bb5d5f0f0f",
  account_public_id: "acct_spending", account_name: "Spending",
  local_date: "2026-10-02", merchant_name: "Woolworths", category: "FOOD_AND_DRINK",
};
const event = {
  id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", type: "transactions.synced",
  data: { new: [transaction], updated: [] },
};
const accounts = new Set([
  "254c6967-ea62-4f0c-bb64-b2bb5d5f0f0f",
  "ad5ba6a1-95e0-43fc-b676-e16d6a3aa29b",
]);

test("converts cents and creates a stable, account-specific identity", () => {
  const parsed = parseTransactionEvent(event, accounts, "2026-10-03");
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].amount, 45.5);
  assert.equal(parsed.rows[0].direction, "debit");
  assert.equal(parsed.rows[0].dedupe_key, "redbark:acct_spending:bank-123");
});

test("allows only selected accounts and the rolling year", () => {
  const parsed = parseTransactionEvent({ ...event, data: { new: [
    transaction,
    { ...transaction, id: "old", local_date: "2025-10-02" },
    { ...transaction, id: "other", account_id: "d8ea3f2b-5793-446b-97dc-857d7730367e", account_public_id: "acct_other" },
  ], updated: [] } }, accounts, "2026-10-03");
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.ignored, 2);
  assert.equal(twelveMonthCutoff("2024-02-29"), "2023-02-28");
});

test("rejects inconsistent amounts before any database write", () => {
  assert.throws(() => parseTransactionEvent({ ...event, data: {
    new: [{ ...transaction, direction: "credit" }], updated: [],
  } }, accounts, "2026-10-03"), /direction mismatch/);
});

test("verifies the raw signed body and rejects tampering or stale requests", async () => {
  const body = JSON.stringify(event);
  const secret = "test-secret";
  const timestamp = "1790985600";
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  const now = Number(timestamp) * 1000;
  assert.equal(await verifySignature(body, timestamp, signature, secret, now), true);
  assert.equal(await verifySignature(`${body} `, timestamp, signature, secret, now), false);
  assert.equal(await verifySignature(body, timestamp, signature, secret, now + 301000), false);
});
