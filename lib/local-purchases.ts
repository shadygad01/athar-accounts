export const LOCAL_PURCHASES_STORAGE_KEY = "athar-local-purchases-v1";

export type LocalPurchaseCurrency = {
  id: string;
  name: string;
  rate: number;
};

export type LocalPurchaseEntry = {
  id: string;
  date: string;
  createdAt?: string;
  description: string;
  type: "addition" | "withdrawal";
  currencyId: string;
  currencyName: string;
  amount: number;
  rate: number;
  voucherValue: number;
};

export function sortLocalPurchaseEntries(entries: LocalPurchaseEntry[]) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) =>
      b.entry.date.localeCompare(a.entry.date) ||
      (b.entry.createdAt || "").localeCompare(a.entry.createdAt || "") ||
      b.index - a.index,
    )
    .map(({ entry }) => entry);
}

export type LocalPurchasesData = {
  currencies: LocalPurchaseCurrency[];
  entries: LocalPurchaseEntry[];
  archives: LocalPurchaseArchive[];
};

export type LocalPurchaseArchive = {
  id: string;
  archivedAt: string;
  currencies: LocalPurchaseCurrency[];
  entries: LocalPurchaseEntry[];
};

export const emptyLocalPurchasesData = (): LocalPurchasesData => ({
  currencies: [],
  entries: [],
  archives: [],
});

export function normalizeLocalPurchasesData(value: unknown): LocalPurchasesData {
  if (!value || typeof value !== "object") return emptyLocalPurchasesData();
  const data = value as Partial<LocalPurchasesData>;
  return {
    currencies: Array.isArray(data.currencies) ? data.currencies : [],
    entries: Array.isArray(data.entries)
      ? data.entries.map((entry) => ({ ...entry, type: entry.type === "withdrawal" ? "withdrawal" : "addition" }))
      : [],
    archives: Array.isArray(data.archives) ? data.archives : [],
  };
}
