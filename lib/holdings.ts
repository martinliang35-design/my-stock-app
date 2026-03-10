import { supabase } from "@/lib/supabase";

export type Holding = {
  id: string;
  user_id?: string;
  code: string;
  name: string;
  market: "A" | "HK" | "US";
  quantity: number;
  cost_price: number;
  current_price: number;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type HoldingInsert = Omit<Holding, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

const TABLE = "holdings";

export async function fetchHoldings(): Promise<Holding[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(normalizeRow);
}

function normalizeRow(row: Record<string, unknown>): Holding {
  return {
    id: String(row.id ?? ""),
    user_id: row.user_id != null ? String(row.user_id) : undefined,
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    market: (row.market === "HK" || row.market === "US" ? row.market : "A") as "A" | "HK" | "US",
    quantity: Number(row.quantity) || 0,
    cost_price: Number(row.cost_price) || 0,
    current_price: Number(row.current_price) || 0,
    sort_order: Number(row.sort_order) ?? 0,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

export async function insertHolding(holding: Partial<HoldingInsert>): Promise<Holding> {
  const row = {
    code: holding.code ?? "",
    name: holding.name ?? "",
    market: holding.market ?? "A",
    quantity: holding.quantity ?? 0,
    cost_price: holding.cost_price ?? 0,
    current_price: holding.current_price ?? 0,
    sort_order: holding.sort_order ?? 0,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from(TABLE).insert(row).select().single();
  if (error) throw error;
  return normalizeRow(data as Record<string, unknown>);
}

export async function updateHolding(
  id: string,
  updates: Partial<Omit<Holding, "id" | "created_at" | "updated_at">>
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteHolding(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

export async function updateHoldingsOrder(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id, index) =>
      supabase.from(TABLE).update({ sort_order: index, updated_at: new Date().toISOString() }).eq("id", id)
    )
  );
}
