export type Priority = "high" | "medium" | "low";

export type DueValue =
  | { type: "today" | "tomorrow" | "week" | "month" }
  | { type: "custom"; date: string }
  | null;

export interface Task {
  id: number;
  user_id: string;
  cat: string;
  name: string;
  done: boolean;
  priority: Priority;
  due: DueValue;
  urgent: boolean;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
}

export interface Bill {
  id: number;
  user_id: string;
  name: string;
  amount: number;
  freq: "Monthly" | "Weekly";
  day: number;
  created_at?: string;
  updated_at?: string;
}

export interface CalendarEvent {
  id: number;
  user_id: string;
  title: string;
  date: string | null;
  time: string | null;
  note: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface InboxItem {
  id: number;
  user_id: string;
  item_type: "message" | "email";
  sender: string;
  platform: string | null;
  subject: string | null;
  content: string;
  age: string | null;
  flag: string | null;
  priority: 1 | 2 | 3;
  archived: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type AppPage = "tasks" | "calendar" | "inbox" | "bills";
export type TaskView = "active" | "future" | "completed";
