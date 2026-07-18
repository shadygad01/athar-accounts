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

export const currencyLabel = (c: SupplierCurrency) => (c === "AED" ? "درهم إماراتي" : "ريال سعودي");
export const currencySymbol = (c: SupplierCurrency) => (c === "AED" ? "د.إ" : "ر.س");

export const foreignMoney = (n: number, currency: SupplierCurrency) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2, numberingSystem: "latn" }).format(
    Math.round((n + Number.EPSILON) * 100) / 100,
  ) +
  " " +
  currencySymbol(currency);

const SHORT_MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** تاريخ مختصر بصيغة "9-Jul" لعرضه في كشف الحساب المضغوط الشبيه بجدول إكسل. */
export const shortDate = (iso: string) => {
  const [, month, day] = iso.split("-").map(Number);
  return `${day}-${SHORT_MONTHS_EN[month - 1]}`;
};

/** رقم صحيح بدون فواصل آلاف أو رموز عملة — لعرضه في كشف الحساب المضغوط الشبيه بجدول إكسل. */
export const plainNumber = (n: number) => Math.round(n).toString();

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
  phone?: string;
  notes?: string;
  currency: SupplierCurrency;
  openingBalance: number;
  openingDate: string;
  transactions: SupplierTx[];
};

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

  if (supplier.openingDate <= asOfDate) {
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
      label: `رصيد مرحّل من كشف رقم ${idx}`,
      egpDelta: prevLast.balanceAfter,
      balanceAfter: prevLast.balanceAfter,
    };
    return [carryRow, ...chunk];
  });

  return sheets.map((sheetRows, idx) => ({ index: idx + 1, total: sheets.length, rows: sheetRows }));
}

/** آخر معامل صرف استُخدم في توريد لهذا المورد — لتعبئته تلقائيًا كنقطة بداية عند تسجيل توريد جديد. */
export function lastRate(supplier: Supplier): number | null {
  const supplies = [...supplier.transactions].filter((t) => t.type === "supply").sort((a, b) => b.date.localeCompare(a.date));
  return supplies[0]?.rate ?? null;
}
