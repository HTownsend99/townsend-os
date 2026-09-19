import { createClient } from "@supabase/supabase-js";
import ical from "node-ical";

const ALLOWED_ORIGINS = new Set([
  "https://townsend-os.com",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);
const ALLOWED_FEED_HOSTS = new Set(["calendar.google.com"]);
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const MAX_EVENTS = 3000;
const SYDNEY_TIME_ZONE = "Australia/Sydney";

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://townsend-os.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

function validateFeedUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("The iCalendar address is not a valid URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || !ALLOWED_FEED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Use the private iCal address copied from Google Calendar settings.");
  }
  return url;
}

async function fetchFeed(raw: string) {
  let url = validateFeedUrl(raw);
  for (let redirects = 0; redirects <= 2; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    let response: Response;
    try {
      response = await fetch(url, { redirect: "manual", signal: controller.signal, headers: { Accept: "text/calendar" } });
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 2) throw new Error("The calendar feed redirected too many times.");
      url = validateFeedUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Google Calendar returned ${response.status}. Refresh the private iCal address.`);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_FEED_BYTES) throw new Error("The calendar feed is too large to sync safely.");
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_FEED_BYTES) throw new Error("The calendar feed is too large to sync safely.");
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Google did not return an iCalendar feed.");
    return text;
  }
  throw new Error("The calendar feed could not be loaded.");
}

function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

function clean(value: unknown, limit: number) {
  if (typeof value !== "string") return null;
  const result = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return result ? result.slice(0, limit) : null;
}

type IcalEvent = {
  type?: string;
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: Date & { dateOnly?: boolean };
  end?: Date;
  datetype?: string;
  status?: string;
  rrule?: { between: (after: Date, before: Date, inclusive?: boolean) => Date[] };
  exdate?: Record<string, Date>;
  recurrences?: Record<string, IcalEvent>;
};

type ExpandedEvent = {
  start: Date;
  end: Date;
  isFullDay: boolean;
  event: IcalEvent;
};

function occurrenceRow(event: IcalEvent, occurrenceStart: Date, userId: string, calendarName: string) {
  const baseStart = event.start as Date;
  const baseEnd = event.end instanceof Date ? event.end : new Date(baseStart.getTime() + 60 * 60 * 1000);
  const occurrenceEnd = new Date(occurrenceStart.getTime() + Math.max(0, baseEnd.getTime() - baseStart.getTime()));
  const allDay = event.datetype === "date" || Boolean(event.start?.dateOnly);
  const start = localParts(occurrenceStart);
  const end = localParts(occurrenceEnd);
  const uid = clean(event.uid, 500) || "calendar-event";
  return {
    user_id: userId,
    title: clean(event.summary, 500) || "Untitled event",
    date: start.date,
    time: allDay ? null : start.time,
    note: clean(event.description, 1500),
    end_date: end.date,
    end_time: allDay ? null : end.time,
    all_day: allDay,
    location: clean(event.location, 500),
    external_id: `${uid}::${occurrenceStart.toISOString()}`,
    source: "ical",
    source_calendar: calendarName,
  };
}

function parseEvents(feed: string, userId: string, calendarName: string) {
  const parsed = ical.sync.parseICS(feed) as Record<string, IcalEvent>;
  const now = new Date();
  const windowStart = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
  const windowEnd = new Date(Date.UTC(now.getUTCFullYear() + 2, now.getUTCMonth() + 1, 1));
  const rows: ReturnType<typeof occurrenceRow>[] = [];
  const seen = new Set<string>();

  for (const item of Object.values(parsed)) {
    if (item.type !== "VEVENT" || !(item.start instanceof Date) || item.status === "CANCELLED") continue;
    const fallbackEnd = item.end instanceof Date ? item.end : new Date(item.start.getTime() + 60 * 60 * 1000);
    const instances = item.rrule
      ? (ical.expandRecurringEvent(item as never, { from: windowStart, to: windowEnd }) as ExpandedEvent[])
      : [{ start: item.start, end: fallbackEnd, isFullDay: item.datetype === "date" || Boolean(item.start.dateOnly), event: item }];
    for (const instance of instances) {
      if (instance.start < windowStart || instance.start >= windowEnd || instance.event.status === "CANCELLED") continue;
      const effective = { ...instance.event, start: instance.start, end: instance.end, datetype: instance.isFullDay ? "date" : instance.event.datetype };
      const effectiveStart = instance.start;
      const row = occurrenceRow(effective, effectiveStart, userId, calendarName);
      if (!seen.has(row.external_id)) {
        seen.add(row.external_id);
        rows.push(row);
      }
      if (rows.length > MAX_EVENTS) throw new Error("The calendar contains too many events for the sync window.");
    }
  }
  return rows;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(request, { error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return json(request, { error: "Calendar sync is not configured" }, 500);

  const client = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userResult, error: userError } = await client.auth.getUser();
  const user = userResult.user;
  if (userError || !user) return json(request, { error: "Your session has expired" }, 401);

  const { data: settings, error: settingsError } = await client
    .from("calendar_sync_settings")
    .select("feed_url, calendar_name, enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (settingsError) return json(request, { error: "Calendar settings could not be loaded" }, 500);
  if (!settings?.enabled) return json(request, { error: "Connect a calendar first" }, 400);

  try {
    const feed = await fetchFeed(settings.feed_url);
    const rows = parseEvents(feed, user.id, settings.calendar_name);
    for (let index = 0; index < rows.length; index += 100) {
      const { error } = await client.from("events").upsert(rows.slice(index, index + 100), { onConflict: "user_id,external_id" });
      if (error) throw error;
    }

    const { data: current, error: currentError } = await client.from("events").select("id, external_id").eq("user_id", user.id).eq("source", "ical");
    if (currentError) throw currentError;
    const activeIds = new Set(rows.map((row) => row.external_id));
    const staleIds = (current || []).filter((event) => event.external_id && !activeIds.has(event.external_id)).map((event) => event.id);
    for (let index = 0; index < staleIds.length; index += 100) {
      const { error } = await client.from("events").delete().eq("user_id", user.id).in("id", staleIds.slice(index, index + 100));
      if (error) throw error;
    }

    const syncedAt = new Date().toISOString();
    await client.from("calendar_sync_settings").update({ last_synced_at: syncedAt, last_sync_status: "success", last_sync_error: null }).eq("user_id", user.id);
    return json(request, { synced: rows.length, removed: staleIds.length, synced_at: syncedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Calendar sync failed";
    await client.from("calendar_sync_settings").update({ last_sync_status: "error", last_sync_error: message }).eq("user_id", user.id);
    return json(request, { error: message }, 422);
  }
});
