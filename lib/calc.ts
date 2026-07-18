// نموذج البيانات ومحرك حساب الفوائد لخدمة "حسابات خاصة".
//
// قواعد الحساب المتفق عليها:
// - فائدة بسيطة غير مركّبة: الفائدة الشهرية تُحسب على أصل المبلغ الحالي فقط، ولا تُضاف لأصل
//   المبلغ أبدًا — تتراكم في رصيد منفصل "الفوائد المستحقة" حتى تُسحب.
// - كل دفعة (شريحة) من العميل تُحسب من تاريخها الخاص وتُجمع في كشف حساب واحد للعميل.
// - سحب من الأصل يقلل قاعدة حساب الفائدة بشكل تناسبي حسب عدد الأيام داخل الشهر (Pro-rata)،
//   أي أن شهر السحب يُقسَّم فعليًا إلى فترتين: قبل السحب وبعد السحب.
// - نوع كل عملية سحب (من الفائدة المستحقة أو من الأصل) يُحدَّد يدويًا عند التسجيل.
// - معدل العائد سنوي (بحسب السنة الميلادية) ويطبَّق على كل الحسابات الخاصة.

export type Tranche = { id: string; amount: number; date: string; note?: string };
export type WithdrawalType = "principal" | "interest";
export type Withdrawal = {
  id: string;
  date: string;
  amount: number;
  type: WithdrawalType;
  note?: string;
};
export type Client = {
  id: string;
  name: string;
  phone?: string;
  notes?: string;
  tranches: Tranche[];
  withdrawals: Withdrawal[];
};
export type YearRate = { year: number; ratePercent: number };

export const monthsAr = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export const money = (n: number) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(
    Math.round((n + Number.EPSILON) * 100) / 100,
  ) + " ج.م";

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
export const today = () => new Date().toISOString().slice(0, 10);

const parseDate = (d: string) => new Date(d + "T12:00:00");
const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const diffDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

export function rateForYear(rates: YearRate[], year: number): number | null {
  const found = rates.find((r) => r.year === year);
  return found ? found.ratePercent : null;
}

export type LedgerRow = {
  id: string;
  date: string;
  kind: "deposit" | "interest" | "withdrawal-principal" | "withdrawal-interest";
  label: string;
  amount: number; // موجب = يزيد المستحق، سالب = ينقصه
  principalAfter: number;
  interestDueAfter: number;
  totalAfter: number;
  note?: string;
};

export type LedgerResult = {
  rows: LedgerRow[];
  missingRateYears: number[];
  summary: {
    totalDeposited: number;
    totalInterestAccrued: number;
    totalWithdrawnPrincipal: number;
    totalWithdrawnInterest: number;
    principalRemaining: number;
    interestDue: number;
    grandTotal: number;
  };
};

const emptyResult = (): LedgerResult => ({
  rows: [],
  missingRateYears: [],
  summary: {
    totalDeposited: 0,
    totalInterestAccrued: 0,
    totalWithdrawnPrincipal: 0,
    totalWithdrawnInterest: 0,
    principalRemaining: 0,
    interestDue: 0,
    grandTotal: 0,
  },
});

const KIND_PRIORITY: Record<LedgerRow["kind"], number> = {
  deposit: 0,
  interest: 1,
  "withdrawal-interest": 2,
  "withdrawal-principal": 3,
};

/** يبني كشف حساب زمني كامل لعميل حتى تاريخ معين (asOfDate)، بما يشمل الإيداعات وفوائد كل شهر والمسحوبات. */
export function buildClientLedger(client: Client, rates: YearRate[], asOfDate: string): LedgerResult {
  const tranches = [...client.tranches].filter((t) => t.amount > 0 && t.date <= asOfDate);
  if (!tranches.length) return emptyResult();

  const withdrawals = [...client.withdrawals].filter((w) => w.amount > 0 && w.date <= asOfDate);
  const startDate = tranches.reduce((min, t) => (t.date < min ? t.date : min), tranches[0].date);
  if (startDate > asOfDate) return emptyResult();

  // نقاط تغيّر قاعدة الأصل (إيداعات + مسحوبات من الأصل)، تُستخدم لتقسيم كل شهر
  // إلى فترات فرعية عند حساب الفائدة بشكل تناسبي (Pro-rata).
  const principalEvents = [
    ...tranches.map((t) => ({ date: t.date, delta: t.amount })),
    ...withdrawals.filter((w) => w.type === "principal").map((w) => ({ date: w.date, delta: -w.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const start = parseDate(startDate);
  const asOf = parseDate(asOfDate);

  // أول يوم لكل شهر بين شهر البداية وشهر تاريخ التقرير، بحد أقصى تاريخ التقرير نفسه.
  const monthStarts: Date[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
  while (cursor <= asOf) {
    monthStarts.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // قائمة نقاط التوقف الرئيسية: بداية كل شهر + تواريخ أحداث الأصل + تاريخ التقرير.
  const breakpointKeys = new Set<string>();
  breakpointKeys.add(toKey(start));
  monthStarts.forEach((m) => breakpointKeys.add(toKey(m)));
  principalEvents.forEach((e) => breakpointKeys.add(e.date));
  breakpointKeys.add(toKey(asOf));
  const breakpoints = [...breakpointKeys].sort().map(parseDate);

  const missingRateYears = new Set<number>();
  const monthlyInterest = new Map<string, { year: number; month: number; amount: number; endDate: string }>();

  let balance = 0;
  let eventCursor = 0;
  for (let i = 0; i < breakpoints.length; i++) {
    const point = breakpoints[i];
    const key = toKey(point);
    // طبّق كل أحداث الأصل المؤرَّخة بنفس هذه النقطة قبل حساب الفترة التالية.
    while (eventCursor < principalEvents.length && principalEvents[eventCursor].date === key) {
      balance += principalEvents[eventCursor].delta;
      eventCursor++;
    }
    const next = breakpoints[i + 1];
    if (!next) break;
    const segmentDays = diffDays(point, next);
    if (segmentDays <= 0 || balance <= 0) continue;
    const year = point.getFullYear();
    const month = point.getMonth();
    const rate = rateForYear(rates, year);
    if (rate === null) {
      missingRateYears.add(year);
      continue;
    }
    const dim = daysInMonth(year, month);
    const monthlyRate = rate / 100 / 12;
    const interest = balance * monthlyRate * (segmentDays / dim);
    const bucketKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    const existing = monthlyInterest.get(bucketKey);
    const endDate = toKey(next);
    if (existing) {
      existing.amount += interest;
      existing.endDate = endDate;
    } else {
      monthlyInterest.set(bucketKey, { year, month, amount: interest, endDate });
    }
  }

  const rows: LedgerRow[] = [];
  tranches.forEach((t) =>
    rows.push({
      id: `dep-${t.id}`,
      date: t.date,
      kind: "deposit",
      label: "إيداع مبلغ جديد",
      amount: t.amount,
      principalAfter: 0,
      interestDueAfter: 0,
      totalAfter: 0,
      note: t.note,
    }),
  );
  withdrawals.forEach((w) =>
    rows.push({
      id: `wd-${w.id}`,
      date: w.date,
      kind: w.type === "principal" ? "withdrawal-principal" : "withdrawal-interest",
      label: w.type === "principal" ? "سحب من أصل المبلغ" : "سحب من الفوائد المستحقة",
      amount: -w.amount,
      principalAfter: 0,
      interestDueAfter: 0,
      totalAfter: 0,
      note: w.note,
    }),
  );
  [...monthlyInterest.entries()].forEach(([bucketKey, v]) => {
    if (v.amount <= 0) return;
    rows.push({
      id: `int-${bucketKey}`,
      date: v.endDate,
      kind: "interest",
      label: `فائدة شهر ${monthsAr[v.month]} ${v.year}`,
      amount: v.amount,
      principalAfter: 0,
      interestDueAfter: 0,
      totalAfter: 0,
    });
  });

  rows.sort((a, b) => a.date.localeCompare(b.date) || KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);

  let runningPrincipal = 0;
  let runningInterestDue = 0;
  let totalDeposited = 0;
  let totalInterestAccrued = 0;
  let totalWithdrawnPrincipal = 0;
  let totalWithdrawnInterest = 0;
  for (const row of rows) {
    if (row.kind === "deposit") {
      runningPrincipal += row.amount;
      totalDeposited += row.amount;
    } else if (row.kind === "withdrawal-principal") {
      runningPrincipal += row.amount;
      totalWithdrawnPrincipal += -row.amount;
    } else if (row.kind === "withdrawal-interest") {
      runningInterestDue += row.amount;
      totalWithdrawnInterest += -row.amount;
    } else if (row.kind === "interest") {
      runningInterestDue += row.amount;
      totalInterestAccrued += row.amount;
    }
    row.principalAfter = runningPrincipal;
    row.interestDueAfter = runningInterestDue;
    row.totalAfter = runningPrincipal + runningInterestDue;
  }

  return {
    rows,
    missingRateYears: [...missingRateYears].sort((a, b) => a - b),
    summary: {
      totalDeposited,
      totalInterestAccrued,
      totalWithdrawnPrincipal,
      totalWithdrawnInterest,
      principalRemaining: runningPrincipal,
      interestDue: runningInterestDue,
      grandTotal: runningPrincipal + runningInterestDue,
    },
  };
}

/** رصيد الأصل والفوائد المستحقة المتاحين للعميل حتى تاريخ معين — لعرضهما وقت تسجيل سحب جديد. */
export function availableBalances(client: Client, rates: YearRate[], asOfDate: string) {
  const ledger = buildClientLedger(client, rates, asOfDate);
  return {
    principalAvailable: ledger.summary.principalRemaining,
    interestAvailable: ledger.summary.interestDue,
  };
}
