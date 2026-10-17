import { createClient } from "@supabase/supabase-js";

// Browser-only client. RLS policies in the database decide what each user can read/write.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { flowType: "pkce" } }
);

export type Member = { id: string; household_id: string; user_id: string; display_name: string };
export type Household = { id: string; name: string; invite_code: string };

export type Expense = {
  id: string;
  household_id: string;
  paid_by: string;
  description: string;
  total_cents: number;
  created_at: string;
  expense_splits: { member_id: string; share_cents: number }[];
};
export type Settlement = {
  id: string;
  household_id: string;
  from_member: string;
  to_member: string;
  cents: number;
  created_at: string;
};

export type ShoppingItem = {
  id: string;
  household_id: string;
  added_by: string;
  name: string;
  done: boolean;
  created_at: string;
};

export type Chore = {
  id: string;
  household_id: string;
  created_by: string;
  assigned_to: string | null;
  title: string;
  due_date: string | null; // "YYYY-MM-DD"
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  created_at: string;
};

export const dollars = (cents: number) =>
  (cents < 0 ? "-$" : "$") + (Math.abs(cents) / 100).toFixed(2);

// "12.5" -> 1250. Returns null for anything that isn't a positive amount.
export function toCents(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

// Split cents into n shares that differ by at most 1 cent and sum exactly to the total.
// e.g. 1000 split 3 ways -> [334, 333, 333]
export function splitEvenly(cents: number, n: number): number[] {
  const base = Math.floor(cents / n);
  const extra = cents % n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

// Color for a member's name based on their overall net: green = owed money, red = owes money, grey = even.
export const netColor = (cents: number) =>
  cents > 0 ? "text-pos" : cents < 0 ? "text-neg" : "text-zero";

// 2600 -> "+$26.00", -1450 -> "-$14.50", 0 -> "$0.00"
export const signedDollars = (cents: number) => (cents > 0 ? "+" : "") + dollars(cents);

