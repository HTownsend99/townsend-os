import type { Task } from "./types";

export const TASK_CATEGORIES = [
  "Admin",
  "Career & Education",
  "Finance",
  "Health",
  "Home & Pets",
  "Personal",
  "Projects",
  "Legal",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const CATEGORY_COLOURS: Record<TaskCategory, string> = {
  Admin: "#71569a",
  "Career & Education": "#846c25",
  Finance: "#15795b",
  Health: "#4f7c45",
  "Home & Pets": "#9b6724",
  Personal: "#79538d",
  Projects: "#257d78",
  Legal: "#53639b",
};

const CATEGORY_ALIASES: Record<string, TaskCategory> = {
  admin: "Admin",
  appointment: "Health",
  automation: "Projects",
  bills: "Finance",
  career: "Career & Education",
  concepts: "Projects",
  data: "Projects",
  education: "Career & Education",
  "email admin": "Admin",
  errand: "Admin",
  finance: "Finance",
  "finance admin": "Finance",
  financial: "Finance",
  "future buys": "Personal",
  health: "Health",
  "health insurance": "Finance",
  household: "Home & Pets",
  insurance: "Finance",
  "job / career": "Career & Education",
  "legal decision": "Legal",
  licence: "Admin",
  "long term": "Projects",
  membership: "Finance",
  messages: "Personal",
  payments: "Finance",
  personal: "Personal",
  "pet admin": "Home & Pets",
  "pet health": "Home & Pets",
  "pet insurance": "Home & Pets",
  planning: "Projects",
  project: "Projects",
  property: "Home & Pets",
  security: "Admin",
  shopping: "Personal",
  socialising: "Personal",
  subscription: "Finance",
  "townsend os": "Projects",
  wealth: "Finance",
  work: "Career & Education",
};

function categoryFromTaskName(taskName: string): TaskCategory {
  const name = taskName.toLowerCase();
  if (/\b(legal|class action|settlement|court|solicitor|barrister)\b/.test(name)) return "Legal";
  if (/\b(job|career|cv|resume|application|apply|gamsat|shift|work|onboarding)\b/.test(name)) return "Career & Education";
  if (/\b(pet|charles|property|rent|home|household|strata|body.?corporate)\b/.test(name)) return "Home & Pets";
  if (/\b(health|doctor|medical|appointment|vaccination|gym|fitness|vyvanse)\b/.test(name)) return "Health";
  if (/\b(bill|budget|expense|payment|pay|balance|bank|card|insurance|membership|subscription|tax|renewal funds)\b/.test(name)) return "Finance";
  if (/\b(project|plan|website|dashboard|automation|app|research|brainstorm|goal)\b/.test(name)) return "Projects";
  if (/\b(admin|email|document|photo|licen[cs]e|account|security|export)\b/.test(name)) return "Admin";
  return "Personal";
}

export function canonicalTaskCategory(category: string | null | undefined, taskName = ""): TaskCategory {
  const value = category?.trim() || "";
  const canonical = TASK_CATEGORIES.find((item) => item.toLowerCase() === value.toLowerCase());
  if (canonical) return canonical;
  if (/^(today|upcoming)$/i.test(value)) return categoryFromTaskName(taskName);
  return CATEGORY_ALIASES[value.toLowerCase()] ?? categoryFromTaskName(taskName);
}

export function canonicalizeTask(task: Task): Task {
  return { ...task, cat: canonicalTaskCategory(task.cat, task.name) };
}
