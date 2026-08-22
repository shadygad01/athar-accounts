// نموذج البيانات ومحرك بناء كشف الحساب لخدمة "حسابات الموردين".
//
// قواعد الحساب المتفق عليها:
// - كل مورد يورّد مبالغ بعملة أجنبية ثابتة له (درهم إماراتي أو ريال سعودي).
// - كل توريد (وارد) له معامل صرف خاص يُتفق عليه وقت المعاملة؛ قيمته بالجنيه المصري = المبلغ × المعامل،
//   وتُضاف إلى الرصيد المستحق للمورد.
// - السداد للمورد (مصروف) يكون دائمًا بالجنيه المصري مباشرة، ويُخصم من الرصيد المستحق.
// - الرصيد السابق قيمة افتتاحية بالجنيه المصري تمثل بداية كشف الحساب.
// - الحركات في نفس التاريخ تحافظ على ترتيب إدخالها (كما في كشف حساب بنكي فعلي).

export type SupplierCurrency = "AED" | "SAR";

export const currencySymbol = (c: SupplierCurrency) => (c === "AED" ? "د.أ" : "ر.س");

/** يسبق اسم المورد بـ"أ/" تلقائيًا أينما ظهر كعنوان حساب. */
export const supplierTitle = (name: string) => `أ/ ${name}`;

export const foreignMoney = (n: number, currency: SupplierCurrency) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2, numberingSystem: "latn" }).format(
    Math.round((n + Number.EPSILON) * 100) / 100,
  ) +
  " " +
  currencySymbol(currency);

export type SupplierTxType = "supply" | "payment";
export type SupplierTx = {
  id: string;
  date: string;
  type: SupplierTxType;
  note?: string;
  amount: number; // توريد: بالعملة الأجنبية للمورد — سداد: بالجنيه المصري
  rate?: number; // معامل الصرف المتفق عليه — للتوريد فقط
};

export type Supplier = {
  id: string;
  name: string;
  notes?: string;
  currency: SupplierCurrency;
  openingBalance: number;
  openingDate: string;
  transactions: SupplierTx[];
  archives?: SupplierStatementArchive[];
};

export type SupplierStatementArchive = {
  id: string;
  archivedAt: string;
  openingBalance: number;
  openingDate: string;
  transactions: SupplierTx[];
  closingBalance: number;
};

/**
 * يعيد نسخة مخصّصة للتقارير تضم تاريخ المورد كاملًا: كل الكشوف المؤرشفة
 * ثم حركات الكشف الحالي. نستخدم الرصيد الافتتاحي لأول كشف فقط لأن رصيد كل
 * كشف لاحق هو رصيد مرحّل من سابقه، وإضافته مرة أخرى ستضاعف الرصيد.
 */
export function supplierReportHistory(supplier: Supplier): Supplier {
  const archives = supplier.archives || [];
  if (!archives.length) return supplier;

  const firstStatement = archives[0];
  return {
    ...supplier,
    openingBalance: firstStatement.openingBalance,
    openingDate: firstStatement.openingDate,
    transactions: [
      ...archives.flatMap((archive) => archive.transactions),
      ...supplier.transactions,
    ],
  };
}

/**
 * مصدر إجماليات الكشف الحالي. الرصيد الافتتاحي الصفري يعني أن الكشف بدأ دورة
 * مستقلة، أما الرصيد الافتتاحي المرحّل فيُبقي الإجماليات تراكمية عبر الأرشيف.
 */
export function supplierCurrentTotalsSource(supplier: Supplier): Supplier {
  if (Math.abs(supplier.openingBalance) < 0.005) return supplier;
  return supplierReportHistory(supplier);
}

/**
 * إجماليات دورة الحساب المفتوحة فقط: عند وصول الرصيد إلى صفر تنتهي الدورة
 * السابقة، وتبدأ إجماليات التوريد والسداد من أول حركة تالية. نعالج كل كشف
 * برصيده الافتتاحي الفعلي حتى تظل التسويات اليدوية والكشوف المؤرشفة صحيحة.
 */
export function supplierTotalsSinceLastZero(supplier: Supplier, asOfDate: string) {
  const statements = [
    ...(supplier.archives || []).map((archive) => ({
      openingBalance: archive.openingBalance,
      openingDate: archive.openingDate,
      transactions: archive.transactions,
    })),
    {
      openingBalance: supplier.openingBalance,
      openingDate: supplier.openingDate,
      transactions: supplier.transactions,
    },
  ];

  let totalSuppliedEgp = 0;
  let totalSuppliedForeign = 0;
  let totalPaid = 0;

  statements.forEach((statement) => {
    if (statement.openingDate > asOfDate) return;
    if (Math.abs(statement.openingBalance) < 0.005) {
      totalSuppliedEgp = 0;
      totalSuppliedForeign = 0;
      totalPaid = 0;
    }

    const ledger = buildSupplierLedger({ ...supplier, ...statement, archives: [] }, asOfDate);
    ledger.rows.forEach((row) => {
      if (row.kind === "supply") {
        totalSuppliedEgp += row.egpDelta;
        totalSuppliedForeign += row.currencyAmount || 0;
      } else if (row.kind === "payment") {
        totalPaid += -row.egpDelta;
      }

      if (Math.abs(row.balanceAfter) < 0.005) {
        totalSuppliedEgp = 0;
        totalSuppliedForeign = 0;
        totalPaid = 0;
      }
    });
  });

  return { totalSuppliedEgp, totalSuppliedForeign, totalPaid };
}

/** يحسب حركة يوم بعينه من الكشف الحالي وكل الكشوف المؤرشفة. */
export function supplierDayTotals(suppliers: Supplier[], date: string) {
  let supplied = 0;
  let paid = 0;

  suppliers.forEach((supplier) => {
    const transactions = [
      ...supplier.transactions,
      ...(supplier.archives || []).flatMap((archive) => archive.transactions),
    ];
    transactions.forEach((transaction) => {
      if (transaction.date !== date) return;
      if (transaction.type === "supply") {
        supplied += transaction.amount * (transaction.rate || 0);
      } else {
        paid += transaction.amount;
      }
    });
  });

  return { supplied, paid };
}

export type SupplierLedgerRow = {
  id: string;
  seq: number;
  date: string;
  kind: "opening" | "supply" | "payment" | "carry";
  label: string;
  currencyAmount?: number;
  rate?: number;
  egpDelta: number;
  balanceAfter: number;
};

export type SupplierLedgerResult = {
  rows: SupplierLedgerRow[];
  summary: {
    totalSuppliedEgp: number;
    totalSuppliedForeign: number;
    totalPaid: number;
    balance: number;
  };
};

const emptySummary = (): SupplierLedgerResult["summary"] => ({
  totalSuppliedEgp: 0,
  totalSuppliedForeign: 0,
  totalPaid: 0,
  balance: 0,
});

/** يبني كشف حساب زمني كامل لمورد حتى تاريخ معين (asOfDate)، بما يشمل الرصيد السابق والتوريدات والسدادات. */
export function buildSupplierLedger(supplier: Supplier, asOfDate: string): SupplierLedgerResult {
  const txs = supplier.transactions.filter((t) => t.amount > 0 && t.date <= asOfDate);

  type Raw = {
    id: string;
    date: string;
    seq: number;
    kind: SupplierLedgerRow["kind"];
    label: string;
    currencyAmount?: number;
    rate?: number;
    egpDelta: number;
  };
  const raw: Raw[] = [];

  if (supplier.openingDate <= asOfDate && Math.abs(supplier.openingBalance) >= 0.005) {
    raw.push({
      id: "opening",
      date: supplier.openingDate,
      seq: -1,
      kind: "opening",
      label: "رصيد سابق",
      egpDelta: supplier.openingBalance,
    });
  }

  txs.forEach((t, i) => {
    if (t.type === "supply") {
      const rate = t.rate || 0;
      raw.push({
        id: t.id,
        date: t.date,
        seq: i,
        kind: "supply",
        label: t.note || "توريد",
        currencyAmount: t.amount,
        rate,
        egpDelta: t.amount * rate,
      });
    } else {
      raw.push({
        id: t.id,
        date: t.date,
        seq: i,
        kind: "payment",
        label: t.note || "سداد",
        egpDelta: -t.amount,
      });
    }
  });

  if (!raw.length) return { rows: [], summary: emptySummary() };

  raw.sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);

  let balance = 0;
  let totalSuppliedEgp = 0;
  let totalSuppliedForeign = 0;
  let totalPaid = 0;
  const rows: SupplierLedgerRow[] = raw.map((r, index) => {
    balance += r.egpDelta;
    if (r.kind === "supply") {
      totalSuppliedEgp += r.egpDelta;
      totalSuppliedForeign += r.currencyAmount || 0;
    } else if (r.kind === "payment") {
      totalPaid += -r.egpDelta;
    }
    return {
      id: r.id,
      seq: index + 1,
      date: r.date,
      kind: r.kind,
      label: r.label,
      currencyAmount: r.currencyAmount,
      rate: r.rate,
      egpDelta: r.egpDelta,
      balanceAfter: balance,
    };
  });

  return { rows, summary: { totalSuppliedEgp, totalSuppliedForeign, totalPaid, balance } };
}

export type LedgerSheet = {
  index: number;
  total: number;
  rows: SupplierLedgerRow[];
};

const SHEET_SIZE = 15;

/**
 * يقسّم كشف الحساب إلى صفحات (كشوف) بحد أقصى 15 معاملة فعلية لكل كشف، كما في كشف حساب بنكي مطبوع.
 * كل كشف بعد الأول يبدأ برصيد مرحّل من آخر كشف، ورقم التسلسل (م) يبقى مستمرًا عبر كل الكشوف
 * ليظل الحساب متسلسلاً بالكامل لأغراض المراجعة، حتى لو تصفّح المستخدم كشفًا أرشيفيًا سابقًا.
 */
export function paginateLedger(rows: SupplierLedgerRow[], pageSize = SHEET_SIZE): LedgerSheet[] {
  if (!rows.length) return [{ index: 1, total: 1, rows: [] }];

  const opening = rows[0].kind === "opening" ? rows[0] : null;
  const txRows = opening ? rows.slice(1) : rows;
  if (!txRows.length) return [{ index: 1, total: 1, rows: opening ? [opening] : [] }];

  const chunks: SupplierLedgerRow[][] = [];
  for (let i = 0; i < txRows.length; i += pageSize) chunks.push(txRows.slice(i, i + pageSize));

  const sheets = chunks.map((chunk, idx) => {
    if (idx === 0) return opening ? [opening, ...chunk] : chunk;
    const prevLast = chunks[idx - 1][chunks[idx - 1].length - 1];
    const carryRow: SupplierLedgerRow = {
      id: `carry-${idx}`,
      seq: prevLast.seq,
      date: chunk[0].date,
      kind: "carry",
      label: `رصيد مرحّل من صفحة رقم ${idx}`,
      egpDelta: prevLast.balanceAfter,
      balanceAfter: prevLast.balanceAfter,
    };
    return [carryRow, ...chunk];
  });

  return sheets.map((sheetRows, idx) => ({ index: idx + 1, total: sheets.length, rows: sheetRows }));
}

/** معامل الصرف في آخر توريد تم تسجيله لهذا المورد — لتعبئته تلقائيًا كنقطة بداية عند تسجيل توريد جديد. */
export function lastRate(supplier: Supplier): number | null {
  const supplies = supplier.transactions.filter((t) => t.type === "supply");
  return supplies.length ? (supplies[supplies.length - 1].rate ?? null) : null;
}
