import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { parseTransactionEvent, verifySignature } from "./validate.ts";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

async function readLimitedBody(request: Request): Promise<string> {
  if (!request.body) throw new Error("Missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error("Body too large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("REDBARK_WEBHOOK_SECRET");
  const owner = Deno.env.get("WEALTH_OWNER_USER_ID");
  const accountIds = (Deno.env.get("REDBARK_ALLOWED_ACCOUNT_IDS") || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !owner || accountIds.length !== 2 || new Set(accountIds).size !== 2 || !url || !serviceKey) {
    console.error("Redbark webhook configuration is incomplete");
    return new Response("Unavailable", { status: 503 });
  }

  let body: string;
  try { body = await readLimitedBody(request); }
  catch { return new Response("Invalid body", { status: 413 }); }
  const valid = await verifySignature(body,
    request.headers.get("X-Redbark-Timestamp"),
    request.headers.get("X-Redbark-Signature"), secret);
  if (!valid) return new Response("Invalid signature", { status: 401 });

  let event;
  try { event = parseTransactionEvent(JSON.parse(body), new Set(accountIds)); }
  catch (error) {
    console.error("Invalid Redbark event:", error instanceof Error ? error.message : "unknown error");
    return new Response("Invalid transaction event", { status: 422 });
  }

  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await client.rpc("ingest_redbark_transactions", {
    p_owner: owner, p_delivery_id: event.deliveryId, p_rows: event.rows,
  });
  if (error) {
    console.error("Redbark ingestion failed:", error.code || "database error");
    return new Response("Ingestion failed", { status: 500 });
  }
  return Response.json({ ok: true, ...data, ignored: event.ignored });
});
