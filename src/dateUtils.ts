import type { Bill, DueValue } from "./types";

const DAY_MS = 86_400_000;

export function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateForDue(due: DueValue, base = new Date()): string | null {
  if (!due) return null;
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  if (due.type === "tomorrow") date.setDate(date.getDate() + 1);
  if (due.type === "week") {
    const daysUntilSunday = (7 - date.getDay()) % 7;
    date.setDate(date.getDate() + daysUntilSunday);
  }
  if (due.type === "month") date.setMonth(date.getMonth() + 1, 0);
  if (due.type === "custom") return due.date;
  return toLocalISODate(date);
}

export function dueLabel(due: DueValue, base = new Date()) {
  const dateValue = dateForDue(due, base);
  if (!dateValue) return null;
  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const dueDate = new Date(`${dateValue}T00:00:00`);
  const difference = Math.round((dueDate.getTime() - today.getTime()) / DAY_MS);
  const text = dueDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  if (difference < 0) return { text: `Overdue · ${text}`, tone: "danger" as const };
  if (difference === 0) return { text: "Today", tone: "warning" as const };
  if (difference === 1) return { text: "Tomorrow", tone: "info" as const };
  return { text, tone: "info" as const };
}

export function billDueLabel(bill: Bill, base = new Date()) {
  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  let nextDue: Date;

  if (bill.freq === "Weekly") {
    const daysAhead = (bill.day - today.getDay() + 7) % 7;
    nextDue = new Date(today);
    nextDue.setDate(today.getDate() + daysAhead);
  } else {
    const day = Math.max(1, Math.min(31, bill.day));
    const lastDayThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    nextDue = new Date(today.getFullYear(), today.getMonth(), Math.min(day, lastDayThisMonth));
    if (nextDue < today) {
      const lastDayNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate();
      nextDue = new Date(today.getFullYear(), today.getMonth() + 1, Math.min(day, lastDayNextMonth));
    }
  }

  const days = Math.round((nextDue.getTime() - today.getTime()) / DAY_MS);
  if (days === 0) return { text: "Due today", tone: "warning" as const };
  if (days === 1) return { text: "Tomorrow", tone: "warning" as const };
  return { text: `Due in ${days}d`, tone: days <= 5 ? ("warning" as const) : ("success" as const) };
}

export function ordinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const suffix = value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

export function formatAUD(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}
