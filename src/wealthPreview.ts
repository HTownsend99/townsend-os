import type { WealthSnapshot } from "./wealthTypes";

const monthly = [
  { month: "2026-06", spend: 10842, reimbursements: 1779, net_spend: 9063 },
  { month: "2026-07", spend: 8906, reimbursements: 1594, net_spend: 7312 },
  { month: "2026-08", spend: 7088, reimbursements: 1201, net_spend: 5887 },
];

export const WEALTH_PREVIEW: WealthSnapshot = {
  overview: {
    total_spend: 26836,
    total_reimbursements: 4574,
    net_spend: 22262,
    average_transaction: 62.1,
    transaction_count: 358,
    monthly,
    top_categories: [
      { category: "Housing", amount: 7902.6 },
      { category: "Food & dining", amount: 3084.42 },
      { category: "Transport", amount: 2227 },
      { category: "Shopping", amount: 2064.63 },
      { category: "Health & wellbeing", amount: 1549.2 },
      { category: "Travel", amount: 1495.86 },
      { category: "Utilities", amount: 1182.54 },
    ],
    by_expense_class: [
      { expense_class: "fixed", amount: 11576.24 },
      { expense_class: "discretionary", amount: 7346.46 },
      { expense_class: "one_off", amount: 3339.3 },
    ],
  },
  trends: {
    granularity: "month",
    periods: monthly.map((item) => item.month),
    total_series: monthly.map((item) => item.net_spend),
    by_class: {},
    by_category: {},
  },
  categories: [
    { category: "Housing", amount: 7902.6, count: 42, subcategories: [{ subcategory: "Rent and home", amount: 7902.6, count: 42, merchants: [{ merchant: "Rent", amount: 6900, count: 3, transactions: [] }, { merchant: "Home services", amount: 1002.6, count: 39, transactions: [] }] }] },
    { category: "Food & dining", amount: 3084.42, count: 86, subcategories: [{ subcategory: "Groceries", amount: 1820.22, count: 38, merchants: [{ merchant: "Woolworths", amount: 970.44, count: 21, transactions: [] }, { merchant: "Coles", amount: 849.78, count: 17, transactions: [] }] }, { subcategory: "Restaurants", amount: 1264.2, count: 48, merchants: [{ merchant: "Various", amount: 1264.2, count: 48, transactions: [] }] }] },
    { category: "Transport", amount: 2227, count: 58, subcategories: [{ subcategory: "Public transport and rides", amount: 2227, count: 58, merchants: [{ merchant: "Transport", amount: 2227, count: 58, transactions: [] }] }] },
  ],
  allCategories: [],
  income: {
    total_income: 30140,
    total_reimbursements: 4574,
    total_inflows: 34714,
    salary_income: 24600,
    rental_income: 5540,
    by_source: [{ source: "Salary", amount: 24600, count: 6 }, { source: "Rental income", amount: 5540, count: 6 }],
    monthly: monthly.map((item, index) => ({ month: item.month, income: [10200, 9800, 10140][index], reimbursements: item.reimbursements, expenses: item.spend, net_cashflow: [1137, 2488, 4253][index] })),
  },
  propertyTrends: {
    granularity: "month",
    periods: monthly.map((item) => item.month),
    total_series: [1380, 920, 760],
    by_class: {},
    by_category: {},
  },
  recurring: [
    { id: "1", name: "Home internet", fixed_cost_bucket: "Utilities", amount: 89, frequency: "monthly", est_monthly: 89, annualised: 1068, next_charge_date: "2026-09-24", status: "confirmed" },
    { id: "2", name: "Gym membership", fixed_cost_bucket: "Health", amount: 24, frequency: "weekly", est_monthly: 104, annualised: 1248, next_charge_date: "2026-09-21", status: "review" },
    { id: "3", name: "Streaming services", fixed_cost_bucket: "Subscriptions", amount: 46, frequency: "monthly", est_monthly: 46, annualised: 552, next_charge_date: "2026-09-28", status: "review" },
  ],
  review: {
    summary: { unknown_count: 4, flagged_count: 2, duplicate_pairs: 1 },
    unknown_merchants: [
      { id: "u1", transaction_date: "2026-08-14", description: "CARD PAYMENT", merchant_name: "", amount: 42.5, category_name: "" },
      { id: "u2", transaction_date: "2026-08-12", description: "BP MOUNT WAVERLEY", merchant_name: "", amount: 78.3, category_name: "" },
      { id: "u3", transaction_date: "2026-08-11", description: "PAYPAL *TIDAL", merchant_name: "", amount: 11.99, category_name: "" },
      { id: "u4", transaction_date: "2026-08-09", description: "SQ *BRUNSWICK EAST", merchant_name: "", amount: 36, category_name: "" },
    ],
    flagged: [
      { id: "f1", transaction_date: "2026-08-02", description: "LARGE TRANSFER", merchant_name: "Bank transfer", amount: 2200, category_name: "Review", flag_reason: "Large irregular debit" },
      { id: "f2", transaction_date: "2026-07-26", description: "ONLINE PURCHASE", merchant_name: "Online retailer", amount: 684, category_name: "Shopping", flag_reason: "Amount outside usual range" },
    ],
    duplicate_candidates: [[
      { id: "d1", transaction_date: "2026-08-04", description: "WOOLWORTHS 3141", merchant_name: "Woolworths", amount: 54.12, category_name: "Groceries" },
      { id: "d2", transaction_date: "2026-08-04", description: "WOOLWORTHS 3141", merchant_name: "Woolworths", amount: 54.12, category_name: "Groceries" },
    ]],
  },
  budget: {
    total_target: 7800,
    total_actual: 6520,
    rows: [
      { category: "Housing", target: 2800, actual: 2634, remaining: 166, percent_used: 94, status: "under" },
      { category: "Food & dining", target: 1200, actual: 1028, remaining: 172, percent_used: 86, status: "under" },
      { category: "Transport", target: 700, actual: 742, remaining: -42, percent_used: 106, status: "over" },
      { category: "Shopping", target: 650, actual: 688, remaining: -38, percent_used: 106, status: "over" },
      { category: "Health & wellbeing", target: 600, actual: 516, remaining: 84, percent_used: 86, status: "under" },
    ],
  },
};

WEALTH_PREVIEW.allCategories = WEALTH_PREVIEW.categories;
