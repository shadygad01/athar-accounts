export type PayableEntryType = "obligation" | "payment";

export type PayableEntry = {
  id: string;
  type: PayableEntryType;
  date: string;
  amount: number;
  note?: string;
};

export type PayableAccount = {
  id: string;
  name: string;
  notes?: string;
  entries: PayableEntry[];
};

export type PayableLedgerRow = PayableEntry & {
  balanceAfter: number;
};

export function buildPayableLedger(account: PayableAccount) {
  const rows: PayableLedgerRow[] = [];
  let totalObligations = 0;
  let totalPayments = 0;
  let balance = 0;

  account.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.amount > 0)
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.index - b.index)
    .forEach(({ entry }) => {
      if (entry.type === "obligation") {
        totalObligations += entry.amount;
        balance += entry.amount;
      } else {
        totalPayments += entry.amount;
        balance -= entry.amount;
      }
      rows.push({ ...entry, balanceAfter: balance });
    });

  return { rows, totalObligations, totalPayments, balance };
}
