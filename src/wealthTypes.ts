export type WealthView =
  | "overview"
  | "trends"
  | "categories"
  | "income"
  | "property"
  | "recurring"
  | "budgets"
  | "review"
  | "import";

export interface WealthOverview {
  total_spend: number;
  total_reimbursements: number;
  net_spend: number;
  average_transaction: number;
  transaction_count: number;
  monthly: Array<{ month: string; spend: number; reimbursements: number; net_spend: number }>;
  top_categories: Array<{ category: string; amount: number }>;
  by_expense_class: Array<{ expense_class: string; amount: number }>;
}

export interface WealthTrends {
  granularity: string;
  periods: string[];
  total_series: number[];
  by_class: Record<string, number[]>;
  by_category: Record<string, number[]>;
}

export interface WealthIncome {
  total_income: number;
  total_reimbursements: number;
  total_inflows: number;
  salary_income: number;
  rental_income: number;
  by_source: Array<{ source: string; amount: number; count: number }>;
  monthly: Array<{ month: string; income: number; reimbursements: number; expenses: number; net_cashflow: number }>;
}

export interface WealthCategory {
  category: string;
  amount: number;
  count: number;
  subcategories: Array<{
    subcategory: string;
    amount: number;
    count: number;
    merchants: Array<{
      merchant: string;
      amount: number;
      count: number;
      transactions: Array<{ id: string; date: string; description: string; amount: number }>;
    }>;
  }>;
}

export interface WealthBudget {
  total_target: number;
  total_actual: number;
  rows: Array<{
    category: string;
    target: number;
    actual: number;
    remaining: number;
    percent_used: number | null;
    status: string;
  }>;
}

export interface WealthReviewTransaction {
  id: string;
  transaction_date: string;
  description: string;
  merchant_name: string;
  amount: number;
  category_name: string;
  suggested_category?: string;
  suggestion_confidence?: string;
  review_note?: string;
  flag_reason?: string;
}

export interface WealthReview {
  summary: { unknown_count: number; flagged_count: number; duplicate_pairs: number };
  unknown_merchants?: WealthReviewTransaction[];
  flagged?: WealthReviewTransaction[];
  duplicate_candidates?: WealthReviewTransaction[][];
}

export interface WealthRecurringBill {
  id: string;
  name: string;
  fixed_cost_bucket?: string;
  amount: number;
  frequency: string;
  est_monthly?: number;
  annualised?: number;
  next_charge_date?: string;
  status: "confirmed" | "review" | "cancel";
}

export interface WealthSnapshot {
  overview: WealthOverview;
  trends: WealthTrends;
  categories: WealthCategory[];
  allCategories: WealthCategory[];
  income: WealthIncome;
  propertyTrends: WealthTrends;
  recurring: WealthRecurringBill[];
  review: WealthReview;
  budget: WealthBudget;
}
