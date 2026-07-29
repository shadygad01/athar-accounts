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
  /** A carried-forward statement row can hold one net amount per currency. */
  openingAmounts?: Record<string, number>;
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

export function carriedForwardEntry(
  entries: LocalPurchaseEntry[],
  currencies: LocalPurchaseCurrency[],
  sourceId: string,
  carriedAt: string,
): LocalPurchaseEntry | null {
  const openingAmounts = Object.fromEntries(currencies.map((currency) => [
    currency.id,
    entries.reduce((sum, entry) => {
      if (entry.openingAmounts) return sum + (entry.openingAmounts[currency.id] || 0);
      if (entry.currencyId !== currency.id) return sum;
      return sum + (entry.type === "withdrawal" ? -entry.amount : entry.amount);
    }, 0),
  ]).filter(([, amount]) => Math.abs(amount as number) >= 0.00005));
  const voucherValue = entries.reduce(
    (sum, entry) => sum + (entry.type === "withdrawal" ? -entry.voucherValue : entry.voucherValue),
    0,
  );

  if (!Object.keys(openingAmounts).length && Math.abs(voucherValue) < 0.005) return null;

  return {
    id: `opening-${sourceId}`,
    date: carriedAt.slice(0, 10),
    createdAt: carriedAt,
    description: "رصيد سابق",
    type: "addition",
    currencyId: "",
    currencyName: "",
    amount: 0,
    rate: 0,
    voucherValue,
    openingAmounts,
  };
}

export const emptyLocalPurchasesData = (): LocalPurchasesData => ({
  currencies: [],
  entries: [],
  archives: [],
});

export function normalizeLocalPurchasesData(value: unknown): LocalPurchasesData {
  if (!value || typeof value !== "object") return emptyLocalPurchasesData();
  const data = value as Partial<LocalPurchasesData>;
  const currencies = Array.isArray(data.currencies) ? data.currencies : [];
  const archives = Array.isArray(data.archives) ? data.archives : [];
  let entries: LocalPurchaseEntry[] = Array.isArray(data.entries)
      ? data.entries.map((entry) => ({
        ...entry,
        type: entry.type === "withdrawal" ? "withdrawal" as const : "addition" as const,
      }))
      : [];

  // Repair statements created by the older archive flow, which cleared the
  // current rows even when the most recently archived statement had a balance.
  if (!entries.length && archives.length) {
    const latestArchive = archives[archives.length - 1];
    const carriedEntry = carriedForwardEntry(
      latestArchive.entries,
      currencies,
      latestArchive.id,
      latestArchive.archivedAt,
    );
    if (carriedEntry) entries = [carriedEntry];
  }

  return { currencies, entries, archives };
}
