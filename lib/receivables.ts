export const RECEIVABLES_STORAGE_KEY = "athar-accounts-receivable-v1";

export type ReceivableEntryType = "advance" | "repayment";

export type ReceivableEntry = {
  id: string;
  type: ReceivableEntryType;
  date: string;
  amount: number;
  note?: string;
};

export type ReceivableAccount = {
  id: string;
  name: string;
  dueDate: string;
  notes?: string;
  entries: ReceivableEntry[];
};

export type ReceivableLedgerRow = ReceivableEntry & { balanceAfter: number };

export function buildReceivableLedger(account: ReceivableAccount) {
  const rows: ReceivableLedgerRow[] = [];
  let totalAdvances = 0;
  let totalRepayments = 0;
  let balance = 0;

  account.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.amount > 0)
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.index - b.index)
    .forEach(({ entry }) => {
      if (entry.type === "advance") {
        totalAdvances += entry.amount;
        balance += entry.amount;
      } else {
        totalRepayments += entry.amount;
        balance -= entry.amount;
      }
      rows.push({ ...entry, balanceAfter: balance });
    });

  return { rows, totalAdvances, totalRepayments, balance };
}

export function receivableDaysAway(dueDate: string, reference = new Date()) {
  const due = new Date(`${dueDate}T12:00:00`);
  const current = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate(), 12);
  return Math.round((due.getTime() - current.getTime()) / 86_400_000);
}
