"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Client,
  LedgerResult,
  Tranche,
  Withdrawal,
  WithdrawalType,
  YearRate,
  availableBalances,
  buildClientLedger,
  money,
  today,
  uid,
} from "@/lib/calc";

const CLIENTS_KEY = "athar-private-accounts-clients-v1";
const RATES_KEY = "athar-private-accounts-rates-v1";

const seedClients: Client[] = [
  {
    id: "demo",
    name: "عميل تجريبي",
    notes: "بيانات تجريبية — يمكن حذف الحساب والبدء ببياناتك.",
    tranches: [{ id: "t1", amount: 100000, date: "2024-01-15", note: "الدفعة الأولى" }],
    withdrawals: [],
  },
];
const seedRates: YearRate[] = [
  { year: 2024, ratePercent: 15 },
  { year: 2025, ratePercent: 18 },
  { year: 2026, ratePercent: 18 },
];

type View = "dashboard" | "clients" | "rates" | "withdrawals" | "reports";
type Modal =
  | "newClient"
  | "editClient"
  | "tranche"
  | "editTranche"
  | "withdrawal"
  | "editWithdrawal"
  | "settle"
  | "rate"
  | null;

const nav: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "لوحة المتابعة", icon: "◫" },
  { id: "clients", label: "حسابات العملاء", icon: "▤" },
  { id: "rates", label: "معدلات العائد السنوية", icon: "٪" },
  { id: "withdrawals", label: "المسحوبات", icon: "◉" },
  { id: "reports", label: "التقارير", icon: "▦" },
];

const badgeForKind = (kind: LedgerResult["rows"][number]["kind"]) => {
  switch (kind) {
    case "deposit":
      return "deposit";
    case "interest":
      return "interest";
    case "withdrawal-principal":
      return "withdrawal";
    case "withdrawal-interest":
      return "withdrawal";
  }
};

export default function Home() {
  const [clients, setClients] = useState<Client[]>([]);
  const [rates, setRates] = useState<YearRate[]>([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [editingTranche, setEditingTranche] = useState<Tranche | null>(null);
  const [editingWithdrawal, setEditingWithdrawal] = useState<{ clientId: string; withdrawal: Withdrawal } | null>(
    null,
  );
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [withdrawalClientId, setWithdrawalClientId] = useState<string>("");
  const [withdrawalDate, setWithdrawalDate] = useState<string>(today());
  const [withdrawalType, setWithdrawalType] = useState<WithdrawalType>("interest");
  const [settleClientId, setSettleClientId] = useState<string>("");
  const [settleDate, setSettleDate] = useState<string>(today());

  const [reportClientId, setReportClientId] = useState<string>("");
  const [reportDateInput, setReportDateInput] = useState<string>(today());
  const [report, setReport] = useState<{ clientId: string; asOfDate: string; result: LedgerResult } | null>(null);
  const [printedAt, setPrintedAt] = useState<string>("");
  const restoreFileRef = useRef<HTMLInputElement>(null);

  // قراءة لمرة واحدة من localStorage عند التحميل — لا يوجد عرض من الخادم لمزامنته معه،
  // فالمتصفح هو مصدر البيانات الوحيد لهذا التطبيق.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const savedClients = localStorage.getItem(CLIENTS_KEY);
    const savedRates = localStorage.getItem(RATES_KEY);
    setClients(savedClients ? JSON.parse(savedClients) : seedClients);
    setRates(savedRates ? JSON.parse(savedRates) : seedRates);
    setReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (ready) localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
  }, [clients, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem(RATES_KEY, JSON.stringify(rates));
  }, [rates, ready]);

  const clientsSorted = useMemo(() => [...clients].sort((a, b) => a.name.localeCompare(b.name, "ar")), [clients]);
  const selectedClient = clients.find((c) => c.id === selectedClientId) || null;

  const clientLedgersToday = useMemo(
    () => new Map(clients.map((c) => [c.id, buildClientLedger(c, rates, today())])),
    [clients, rates],
  );
  const allWithdrawals = useMemo(
    () =>
      clients
        .flatMap((c) => c.withdrawals.map((w) => ({ ...w, clientId: c.id, clientName: c.name })))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [clients],
  );
  const missingRateYears = useMemo(() => {
    const s = new Set<number>();
    clientLedgersToday.forEach((ledger) => ledger.missingRateYears.forEach((y) => s.add(y)));
    return [...s].sort((a, b) => a - b);
  }, [clientLedgersToday]);

  const totals = useMemo(() => {
    let due = 0;
    let interestDue = 0;
    clientLedgersToday.forEach((ledger) => {
      due += ledger.summary.grandTotal;
      interestDue += ledger.summary.interestDue;
    });
    return { due, interestDue };
  }, [clientLedgersToday]);

  if (!ready) return <main className="loading">جارٍ تجهيز النظام…</main>;

  function backupData() {
    const blob = new Blob(
      [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), clients, rates }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // يجب إلحاق الرابط بالمستند حتى يلتزم المتصفح باسم الملف المحدَّد في download
    // بدل تسميته "download" تلقائيًا.
    a.download = `نسخة-احتياطية-حسابات-خاصة-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function restoreData(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!Array.isArray(data.clients)) {
          alert("ملف غير صالح — لا يحتوي على بيانات عملاء.");
          return;
        }
        if (
          !confirm(
            "سيتم استبدال كل البيانات الحالية (العملاء والدفعات والمسحوبات ومعدلات العائد) بالبيانات الموجودة في هذا الملف. هل تريد المتابعة؟",
          )
        )
          return;
        setClients(data.clients);
        if (Array.isArray(data.rates)) setRates(data.rates);
        alert("تم استرجاع البيانات بنجاح.");
      } catch {
        alert("تعذر قراءة الملف — تأكد أنه ملف نسخة احتياطية صحيح.");
      }
    };
    reader.readAsText(file);
  }

  function saveClient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    if (!name) return;
    if (editingClient) {
      setClients((v) =>
        v.map((c) =>
          c.id === editingClient.id
            ? { ...c, name, notes: String(fd.get("notes") || "") }
            : c,
        ),
      );
      setEditingClient(null);
    } else {
      const client: Client = {
        id: uid(),
        name,
        notes: String(fd.get("notes") || ""),
        tranches: [],
        withdrawals: [],
      };
      setClients((v) => [...v, client]);
      setSelectedClientId(client.id);
    }
    setModal(null);
  }

  function deleteClient(id: string) {
    if (!confirm("حذف هذا العميل وكل بياناته (الدفعات والمسحوبات)؟")) return;
    setClients((v) => v.filter((c) => c.id !== id));
    if (selectedClientId === id) setSelectedClientId("");
  }

  function saveTranche(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedClientId) return;
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    const date = String(fd.get("date"));
    if (amount <= 0 || !date) return;
    if (editingTranche) {
      setClients((v) =>
        v.map((c) =>
          c.id === selectedClientId
            ? {
                ...c,
                tranches: c.tranches.map((t) =>
                  t.id === editingTranche.id ? { ...t, amount, date, note: String(fd.get("note") || "") } : t,
                ),
              }
            : c,
        ),
      );
      setEditingTranche(null);
    } else {
      setClients((v) =>
        v.map((c) =>
          c.id === selectedClientId
            ? { ...c, tranches: [...c.tranches, { id: uid(), amount, date, note: String(fd.get("note") || "") }] }
            : c,
        ),
      );
    }
    setModal(null);
  }

  function deleteTranche(clientId: string, trancheId: string) {
    if (!confirm("حذف هذه الدفعة؟ سيُعاد حساب فوائد العميل تلقائيًا.")) return;
    setClients((v) => v.map((c) => (c.id === clientId ? { ...c, tranches: c.tranches.filter((t) => t.id !== trancheId) } : c)));
  }

  function saveWithdrawal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const clientId = String(fd.get("clientId"));
    const amount = Number(fd.get("amount"));
    const date = String(fd.get("date"));
    const type = String(fd.get("type")) as WithdrawalType;
    const client = clients.find((c) => c.id === clientId);
    if (!client || amount <= 0 || !date) return;
    const available = availableBalances(client, rates, date);
    const cap = type === "principal" ? available.principalAvailable : available.interestAvailable;
    if (amount > cap + 0.01) {
      alert(
        `المبلغ المطلوب سحبه (${money(amount)}) أكبر من ${
          type === "principal" ? "أصل المبلغ المتاح" : "الفوائد المستحقة المتاحة"
        } حتى هذا التاريخ (${money(Math.max(0, cap))}).`,
      );
      return;
    }
    if (editingWithdrawal) {
      setClients((v) =>
        v.map((c) =>
          c.id === editingWithdrawal.clientId
            ? {
                ...c,
                withdrawals: c.withdrawals.filter((w) => w.id !== editingWithdrawal.withdrawal.id),
              }
            : c,
        ),
      );
    }
    setClients((v) =>
      v.map((c) =>
        c.id === clientId
          ? {
              ...c,
              withdrawals: [
                ...c.withdrawals,
                { id: editingWithdrawal?.withdrawal.id || uid(), amount, date, type, note: String(fd.get("note") || "") },
              ],
            }
          : c,
      ),
    );
    setEditingWithdrawal(null);
    setModal(null);
  }

  function deleteWithdrawal(clientId: string, withdrawalId: string) {
    if (!confirm("حذف عملية السحب هذه؟")) return;
    setClients((v) =>
      v.map((c) => (c.id === clientId ? { ...c, withdrawals: c.withdrawals.filter((w) => w.id !== withdrawalId) } : c)),
    );
  }

  function saveSettlement(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const clientId = String(fd.get("clientId"));
    const date = String(fd.get("date"));
    const note = String(fd.get("note") || "تصفية كاملة للحساب");
    const client = clients.find((c) => c.id === clientId);
    if (!client || !date) return;
    const available = availableBalances(client, rates, date);
    const principalAmount = Math.max(0, available.principalAvailable);
    const interestAmount = Math.max(0, available.interestAvailable);
    if (principalAmount < 0.01 && interestAmount < 0.01) {
      alert("لا يوجد رصيد لتصفيته لهذا العميل حتى هذا التاريخ.");
      return;
    }
    if (
      !confirm(
        `سيتم تسجيل سحب أصل المبلغ (${money(principalAmount)}) والفوائد المستحقة (${money(interestAmount)}) معًا — بإجمالي ${money(principalAmount + interestAmount)} — وسيصبح رصيد العميل صفرًا حتى هذا التاريخ. هل تريد المتابعة؟`,
      )
    )
      return;
    const newWithdrawals: Withdrawal[] = [];
    if (principalAmount >= 0.01) newWithdrawals.push({ id: uid(), date, amount: principalAmount, type: "principal", note });
    if (interestAmount >= 0.01) newWithdrawals.push({ id: uid(), date, amount: interestAmount, type: "interest", note });
    setClients((v) => v.map((c) => (c.id === clientId ? { ...c, withdrawals: [...c.withdrawals, ...newWithdrawals] } : c)));
    setModal(null);
  }

  function saveRate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const year = Number(fd.get("year"));
    const ratePercent = Number(fd.get("ratePercent"));
    if (!year || ratePercent < 0) return;
    setRates((v) => {
      const exists = v.some((r) => r.year === year);
      const next = exists ? v.map((r) => (r.year === year ? { year, ratePercent } : r)) : [...v, { year, ratePercent }];
      return next.sort((a, b) => b.year - a.year);
    });
    setModal(null);
  }

  function deleteRate(year: number) {
    if (!confirm(`حذف معدل سنة ${year}؟`)) return;
    setRates((v) => v.filter((r) => r.year !== year));
  }

  function generateReport() {
    const client = clients.find((c) => c.id === reportClientId);
    if (!client) {
      alert("اختر عميلًا لعرض تقريره.");
      return;
    }
    if (!reportDateInput) return;
    const result = buildClientLedger(client, rates, reportDateInput);
    setReport({ clientId: client.id, asOfDate: reportDateInput, result });
  }

  function printReport() {
    // نُثبّت تاريخ ووقت الطباعة داخل محتوى الصفحة نفسه، لأن ترويسة/تذييل الطباعة
    // التلقائية في المتصفح (لو أوقفها المستخدم) تختفي بالكامل ولا نتحكم فيها من الكود.
    setPrintedAt(
      new Date().toLocaleString("ar-EG-u-ca-gregory", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
    // المتصفح يضيف عنوان الصفحة تلقائيًا في ترويسة الطباعة؛ نُفرغه مؤقتًا حتى لا يظهر
    // اسم النظام والشركة أعلى كشف الحساب المطبوع، ثم نُعيده بعد انتهاء الطباعة.
    const originalTitle = document.title;
    document.title = "";
    const restoreTitle = () => {
      document.title = originalTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };
    window.addEventListener("afterprint", restoreTitle);
    // تأجيل بسيط حتى يُحدَّث الـ DOM بوقت الطباعة الجديد قبل فتح نافذة الطباعة.
    requestAnimationFrame(() => window.print());
  }

  const reportClient = report ? clients.find((c) => c.id === report.clientId) : null;
  const withdrawalPreview =
    withdrawalClientId && withdrawalDate
      ? (() => {
          const c = clients.find((x) => x.id === withdrawalClientId);
          return c ? availableBalances(c, rates, withdrawalDate) : null;
        })()
      : null;
  const settlePreview =
    settleClientId && settleDate
      ? (() => {
          const c = clients.find((x) => x.id === settleClientId);
          return c ? availableBalances(c, rates, settleDate) : null;
        })()
      : null;

  return (
    <div className="app" dir="rtl">
      <aside className="sidebar print-hide">
        <div className="brand">
          <div>
            <strong>حسابات خاصة</strong>
            <small>متابعة عوائد العملاء ومسحوباتهم</small>
          </div>
        </div>
        <nav>
          {nav.map((n) => (
            <button key={n.id} className={view === n.id ? "active" : ""} onClick={() => setView(n.id)}>
              <span>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="side-actions">
          <button onClick={backupData}>↓ نسخ احتياطي</button>
          <button onClick={() => restoreFileRef.current?.click()}>↑ استعادة البيانات</button>
          <input
            ref={restoreFileRef}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              restoreData(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <small>البيانات محفوظة على هذا الجهاز</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar print-hide">
          <div>
            <h1>{nav.find((n) => n.id === view)?.label}</h1>
            <p>حسابات خاصة بالعملاء وفوائدها الشهرية ومسحوباتهم</p>
          </div>
          <div className="header-actions">
            {view === "clients" && (
              <button
                className="primary"
                onClick={() => {
                  setEditingClient(null);
                  setModal("newClient");
                }}
              >
                ＋ عميل جديد
              </button>
            )}
            {view === "withdrawals" && (
              <>
                <button
                  className="secondary"
                  onClick={() => {
                    setSettleClientId(selectedClientId || clients[0]?.id || "");
                    setSettleDate(today());
                    setModal("settle");
                  }}
                >
                  تصفية حساب عميل بالكامل
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    setEditingWithdrawal(null);
                    setWithdrawalClientId(selectedClientId || clients[0]?.id || "");
                    setWithdrawalDate(today());
                    setWithdrawalType("interest");
                    setModal("withdrawal");
                  }}
                >
                  ＋ تسجيل سحب
                </button>
              </>
            )}
            {view === "rates" && (
              <button className="primary" onClick={() => setModal("rate")}>
                ＋ إضافة / تعديل معدل سنة
              </button>
            )}
          </div>
        </header>

        {missingRateYears.length > 0 && (
          <div className="note print-hide" style={{ marginBottom: 18 }}>
            تنبيه: لا يوجد معدل عائد مسجَّل للسنوات التالية: {missingRateYears.join("، ")} — لن تُحسب فائدة عن هذه
            السنوات حتى يتم تسجيل معدلها من تبويب «معدلات العائد السنوية».
          </div>
        )}

        {view === "dashboard" && (
          <>
            <section className="stats">
              <article>
                <span className="stat-icon blue">◉</span>
                <div>
                  <small>عدد العملاء</small>
                  <b>{clients.length}</b>
                  <em>حساب خاص نشط</em>
                </div>
              </article>
              <article>
                <span className="stat-icon gold">٪</span>
                <div>
                  <small>الفوائد المستحقة غير المسحوبة</small>
                  <b>{money(totals.interestDue)}</b>
                  <em>حتى تاريخ اليوم</em>
                </div>
              </article>
              <article>
                <span className="stat-icon red">◫</span>
                <div>
                  <small>إجمالي المستحق للعملاء</small>
                  <b>{money(totals.due)}</b>
                  <em>أصل + فوائد حتى اليوم</em>
                </div>
              </article>
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>ملخص حسابات العملاء</h2>
                  <p>محسوب حتى تاريخ اليوم {today()}</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>العميل</th>
                      <th>أصل المبلغ المتبقي</th>
                      <th>الفوائد المستحقة</th>
                      <th>الإجمالي المستحق</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientsSorted.length ? (
                      clientsSorted.map((c) => {
                        const ledger = clientLedgersToday.get(c.id)!;
                        return (
                          <tr key={c.id}>
                            <td>
                              <b>{c.name}</b>
                            </td>
                            <td>{money(ledger.summary.principalRemaining)}</td>
                            <td>{money(ledger.summary.interestDue)}</td>
                            <td>
                              <b>{money(ledger.summary.grandTotal)}</b>
                            </td>
                            <td>
                              <button
                                className="text-btn"
                                onClick={() => {
                                  setReportClientId(c.id);
                                  setReportDateInput(today());
                                  setView("reports");
                                }}
                              >
                                عرض تقرير ←
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="empty">
                          لا يوجد عملاء مسجلون بعد
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {view === "clients" && (
          <section className="content-stack">
            {!selectedClientId ? (
              <div className="companies-grid">
                {clientsSorted.map((c) => {
                  const ledger = clientLedgersToday.get(c.id)!;
                  return (
                    <button className="company-card" key={c.id} onClick={() => setSelectedClientId(c.id)}>
                      <span className="company-dot">{c.name.slice(0, 1)}</span>
                      <div>
                        <h3>{c.name}</h3>
                        <p>
                          {c.tranches.length} دفعة · {c.withdrawals.length} سحب
                        </p>
                      </div>
                      <div className="company-money">
                        <small>الإجمالي المستحق اليوم</small>
                        <b>{money(ledger.summary.grandTotal)}</b>
                        <em>أصل {money(ledger.summary.principalRemaining)}</em>
                      </div>
                      <strong className="arrow">←</strong>
                    </button>
                  );
                })}
                {clients.length === 0 && <div className="empty-state">لا يوجد عملاء مسجلون. أضف أول حساب خاص للبدء.</div>}
              </div>
            ) : selectedClient ? (
              <>
                <div className="company-tools print-hide">
                  <button className="secondary" onClick={() => setSelectedClientId("")}>
                    → كل العملاء
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setEditingClient(selectedClient);
                      setModal("editClient");
                    }}
                  >
                    تعديل بيانات العميل
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setReportClientId(selectedClient.id);
                      setReportDateInput(today());
                      setView("reports");
                    }}
                  >
                    تقرير العميل
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setSettleClientId(selectedClient.id);
                      setSettleDate(today());
                      setModal("settle");
                    }}
                  >
                    تصفية الحساب بالكامل
                  </button>
                  <button className="danger-link" onClick={() => deleteClient(selectedClient.id)}>
                    حذف العميل
                  </button>
                </div>
                <div className="contract-card">
                  <div className="contract-top">
                    <div>
                      <span className="company-dot">{selectedClient.name.slice(0, 1)}</span>
                      <div>
                        <h3>{selectedClient.name}</h3>
                        <p>{selectedClient.notes || "بدون ملاحظات"}</p>
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const ledger = clientLedgersToday.get(selectedClient.id)!;
                    return (
                      <div className="contract-grid">
                        <span>
                          <small>أصل المبلغ المتبقي</small>
                          <b>{money(ledger.summary.principalRemaining)}</b>
                        </span>
                        <span>
                          <small>الفوائد المستحقة</small>
                          <b>{money(ledger.summary.interestDue)}</b>
                        </span>
                        <span>
                          <small>إجمالي الفوائد منذ البداية</small>
                          <b>{money(ledger.summary.totalInterestAccrued)}</b>
                        </span>
                        <span>
                          <small>الإجمالي المستحق اليوم</small>
                          <b>{money(ledger.summary.grandTotal)}</b>
                        </span>
                      </div>
                    );
                  })()}
                  <div className="subhead">
                    <b>الدفعات (الشرائح)</b>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => {
                        setEditingTranche(null);
                        setModal("tranche");
                      }}
                    >
                      ＋ إضافة دفعة
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>تاريخ الدفعة</th>
                          <th>المبلغ</th>
                          <th>ملاحظات</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedClient.tranches.length ? (
                          [...selectedClient.tranches]
                            .sort((a, b) => a.date.localeCompare(b.date))
                            .map((t) => (
                              <tr key={t.id}>
                                <td>{t.date}</td>
                                <td>{money(t.amount)}</td>
                                <td>{t.note || "—"}</td>
                                <td>
                                  <div className="payment-actions">
                                    <button
                                      className="edit-payment"
                                      onClick={() => {
                                        setEditingTranche(t);
                                        setModal("editTranche");
                                      }}
                                    >
                                      تعديل
                                    </button>
                                    <button className="delete-payment" onClick={() => deleteTranche(selectedClient.id, t.id)}>
                                      حذف
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="empty">
                              لا توجد دفعات مسجلة لهذا العميل
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="subhead">
                    <b>المسحوبات</b>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => {
                        setEditingWithdrawal(null);
                        setWithdrawalClientId(selectedClient.id);
                        setWithdrawalDate(today());
                        setWithdrawalType("interest");
                        setModal("withdrawal");
                      }}
                    >
                      ＋ تسجيل سحب
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>التاريخ</th>
                          <th>النوع</th>
                          <th>المبلغ</th>
                          <th>ملاحظات</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedClient.withdrawals.length ? (
                          [...selectedClient.withdrawals]
                            .sort((a, b) => b.date.localeCompare(a.date))
                            .map((w) => (
                              <tr key={w.id}>
                                <td>{w.date}</td>
                                <td>
                                  <span className={`badge ${w.type === "principal" ? "principal" : "interest"}`}>
                                    {w.type === "principal" ? "من الأصل" : "من الفائدة"}
                                  </span>
                                </td>
                                <td>{money(w.amount)}</td>
                                <td>{w.note || "—"}</td>
                                <td>
                                  <div className="payment-actions">
                                    <button
                                      className="edit-payment"
                                      onClick={() => {
                                        setEditingWithdrawal({ clientId: selectedClient.id, withdrawal: w });
                                        setWithdrawalClientId(selectedClient.id);
                                        setWithdrawalDate(w.date);
                                        setWithdrawalType(w.type);
                                        setModal("editWithdrawal");
                                      }}
                                    >
                                      تعديل
                                    </button>
                                    <button className="delete-payment" onClick={() => deleteWithdrawal(selectedClient.id, w.id)}>
                                      حذف
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="empty">
                              لا توجد مسحوبات مسجلة لهذا العميل
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </section>
        )}

        {view === "rates" && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>معدلات العائد السنوية</h2>
                <p>يُطبَّق المعدل على كل الحسابات الخاصة حسب السنة الميلادية لكل شهر</p>
              </div>
            </div>
            <div style={{ padding: "0 22px 22px" }}>
              <div className="rate-list">
                {[...rates]
                  .sort((a, b) => b.year - a.year)
                  .map((r) => (
                    <div className="rate-row" key={r.year}>
                      <b>سنة {r.year}</b>
                      <small>معدل سنوي {r.ratePercent}% — شهريًا {(r.ratePercent / 12).toFixed(2)}%</small>
                      <div className="payment-actions">
                        <button
                          className="edit-payment"
                          onClick={() => {
                            setModal("rate");
                          }}
                        >
                          تعديل
                        </button>
                        <button className="delete-payment" onClick={() => deleteRate(r.year)}>
                          حذف
                        </button>
                      </div>
                    </div>
                  ))}
                {rates.length === 0 && <div className="empty-state">لا توجد معدلات مسجلة بعد</div>}
              </div>
            </div>
          </section>
        )}

        {view === "withdrawals" && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>كل عمليات السحب</h2>
                <p>مرتبة من الأحدث إلى الأقدم لكل العملاء</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>العميل</th>
                    <th>التاريخ</th>
                    <th>النوع</th>
                    <th>المبلغ</th>
                    <th>ملاحظات</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {allWithdrawals.length ? (
                    allWithdrawals.map((w) => (
                      <tr key={w.id}>
                        <td>
                          <b>{w.clientName}</b>
                        </td>
                        <td>{w.date}</td>
                        <td>
                          <span className={`badge ${w.type === "principal" ? "principal" : "interest"}`}>
                            {w.type === "principal" ? "من الأصل" : "من الفائدة"}
                          </span>
                        </td>
                        <td>{money(w.amount)}</td>
                        <td>{w.note || "—"}</td>
                        <td>
                          <div className="payment-actions">
                            <button
                              className="edit-payment"
                              onClick={() => {
                                setEditingWithdrawal({ clientId: w.clientId, withdrawal: w });
                                setWithdrawalClientId(w.clientId);
                                setWithdrawalDate(w.date);
                                setWithdrawalType(w.type);
                                setModal("editWithdrawal");
                              }}
                            >
                              تعديل
                            </button>
                            <button className="delete-payment" onClick={() => deleteWithdrawal(w.clientId, w.id)}>
                              حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="empty">
                        لا توجد مسحوبات مسجلة بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {view === "reports" && (
          <section className="report">
            <div className="section-title print-hide">
              <div>
                <h2>كشف حساب العميل</h2>
                <p>اختر العميل وتاريخ عرض التقرير، ثم اضغط «عرض التقرير» لحساب كل الحركات حتى هذا التاريخ</p>
              </div>
            </div>
            <div className="panel print-hide">
              <div style={{ padding: 22 }}>
                <div className="report-toolbar">
                  <label>
                    العميل
                    <select value={reportClientId} onChange={(e) => setReportClientId(e.target.value)}>
                      <option value="">اختر عميلًا</option>
                      {clientsSorted.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    تاريخ عرض التقرير
                    <input type="date" value={reportDateInput} onChange={(e) => setReportDateInput(e.target.value)} />
                  </label>
                  <button className="primary" onClick={generateReport}>
                    عرض التقرير
                  </button>
                  {report && (
                    <button className="secondary" onClick={printReport}>
                      طباعة / حفظ PDF
                    </button>
                  )}
                </div>
              </div>
            </div>

            {report && reportClient && (
              <>
                <div className="print-title">
                  <h1>كشف حساب — حسابات خاصة</h1>
                  <p>
                    تاريخ التقرير {report.asOfDate}
                    {printedAt ? ` · تاريخ ووقت الطباعة ${printedAt}` : ""}
                  </p>
                </div>
                <div className="panel">
                  <div className="statement-head">
                    <div>
                      <h2 className="client-name print-hide">{reportClient.name}</h2>
                      <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>
                        {reportClient.tranches.length} دفعة مسجلة
                      </p>
                    </div>
                    <div className="as-of">
                      <small style={{ color: "var(--muted)", fontSize: 11 }}>محسوب حتى تاريخ</small>
                      <b>{report.asOfDate}</b>
                    </div>
                  </div>
                  {report.result.missingRateYears.length > 0 && (
                    <div className="note print-hide" style={{ margin: 18 }}>
                      تنبيه: لا يوجد معدل عائد مسجَّل للسنوات: {report.result.missingRateYears.join("، ")} — لم تُحسب
                      فائدة عن هذه الفترات.
                    </div>
                  )}
                </div>

                <div className="report-summary">
                  <span className="print-hide">
                    إجمالي المودَع <b>{money(report.result.summary.totalDeposited)}</b>
                  </span>
                  <span>
                    أصل المبلغ المتبقي <b>{money(report.result.summary.principalRemaining)}</b>
                  </span>
                  <span className="print-hide">
                    إجمالي الفوائد منذ البداية <b>{money(report.result.summary.totalInterestAccrued)}</b>
                  </span>
                  <span>
                    الفوائد المستحقة غير المسحوبة <b>{money(report.result.summary.interestDue)}</b>
                  </span>
                  <span className="print-hide">
                    إجمالي المسحوبات <b>{money(report.result.summary.totalWithdrawnPrincipal + report.result.summary.totalWithdrawnInterest)}</b>
                  </span>
                  <span>
                    الإجمالي المستحق للعميل <b>{money(report.result.summary.grandTotal)}</b>
                  </span>
                </div>

                <div className="panel report-table">
                  <div className="panel-head">
                    <div>
                      <h2>حركة الحساب بالتسلسل الزمني</h2>
                      <p>إيداعات، فوائد شهرية، ومسحوبات — مع الرصيد بعد كل حركة</p>
                    </div>
                  </div>
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>التاريخ</th>
                        <th>البيان</th>
                        <th>نوع الحركة</th>
                        <th>المبلغ</th>
                        <th>أصل المبلغ بعد الحركة</th>
                        <th>الفوائد المستحقة بعد الحركة</th>
                        <th>الإجمالي المستحق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.result.rows.length ? (
                        report.result.rows.map((row) => (
                          <tr
                            key={row.id}
                            className={
                              row.kind === "deposit"
                                ? "row-deposit"
                                : row.kind === "interest"
                                  ? "row-interest"
                                  : "row-withdrawal"
                            }
                          >
                            <td>{row.date}</td>
                            <td>
                              <b>{row.label}</b>
                              {row.note && <small>{row.note}</small>}
                            </td>
                            <td>
                              <span className={`badge ${badgeForKind(row.kind)}`}>
                                {row.kind === "deposit"
                                  ? "إيداع"
                                  : row.kind === "interest"
                                    ? "فائدة"
                                    : row.kind === "withdrawal-principal"
                                      ? "سحب أصل"
                                      : "سحب فائدة"}
                              </span>
                            </td>
                            <td>{row.amount >= 0 ? "+" : ""}{money(row.amount)}</td>
                            <td>{money(row.principalAfter)}</td>
                            <td>{money(row.interestDueAfter)}</td>
                            <td>
                              <b>{money(row.totalAfter)}</b>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="empty">
                            لا توجد حركات محسوبة حتى هذا التاريخ
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {report.result.rows.length > 0 && (
                      <tfoot>
                        <tr className="total-row">
                          <td colSpan={6}>الإجمالي المستحق للعميل حتى {report.asOfDate}</td>
                          <td>{money(report.result.summary.grandTotal)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </>
            )}
            {!report && (
              <div className="panel">
                <div className="empty">اختر عميلًا وتاريخًا ثم اضغط «عرض التقرير» لعرض كشف الحساب</div>
              </div>
            )}
          </section>
        )}
      </main>

      {(modal === "newClient" || modal === "editClient") && (
        <Modal title={editingClient ? `تعديل بيانات — ${editingClient.name}` : "عميل جديد"} close={() => setModal(null)}>
          <form className="form" onSubmit={saveClient}>
            <div className="form-grid">
              <label className="wide">
                اسم العميل
                <input name="name" required defaultValue={editingClient?.name} />
              </label>
              <label className="wide">
                ملاحظات
                <input name="notes" defaultValue={editingClient?.notes} />
              </label>
            </div>
            <button className="primary submit">{editingClient ? "حفظ التعديلات" : "إضافة العميل"}</button>
          </form>
        </Modal>
      )}

      {(modal === "tranche" || modal === "editTranche") && selectedClient && (
        <Modal title={editingTranche ? "تعديل دفعة" : `دفعة جديدة — ${selectedClient.name}`} close={() => setModal(null)}>
          <form className="form" onSubmit={saveTranche}>
            <div className="form-hint">تُحسب فائدة هذه الدفعة بشكل مستقل ابتداءً من تاريخها.</div>
            <div className="form-grid">
              <label>
                المبلغ
                <input name="amount" type="number" min="1" step="0.01" required defaultValue={editingTranche?.amount} />
              </label>
              <label>
                تاريخ الدفعة
                <input name="date" type="date" required defaultValue={editingTranche?.date || today()} />
              </label>
              <label className="wide">
                ملاحظات
                <input name="note" defaultValue={editingTranche?.note} />
              </label>
            </div>
            <button className="primary submit">{editingTranche ? "حفظ التعديلات" : "إضافة الدفعة"}</button>
          </form>
        </Modal>
      )}

      {(modal === "withdrawal" || modal === "editWithdrawal") && (
        <Modal title={editingWithdrawal ? "تعديل عملية سحب" : "تسجيل سحب جديد"} close={() => setModal(null)}>
          <form className="form" onSubmit={saveWithdrawal}>
            <div className="form-grid">
              <label className="wide">
                العميل
                <select
                  name="clientId"
                  required
                  value={withdrawalClientId}
                  onChange={(e) => setWithdrawalClientId(e.target.value)}
                >
                  <option value="">اختر عميلًا</option>
                  {clientsSorted.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                نوع السحب
                <select name="type" value={withdrawalType} onChange={(e) => setWithdrawalType(e.target.value as WithdrawalType)}>
                  <option value="interest">من الفوائد المستحقة</option>
                  <option value="principal">من أصل المبلغ</option>
                </select>
              </label>
              <label>
                تاريخ السحب
                <input
                  name="date"
                  type="date"
                  required
                  value={withdrawalDate}
                  onChange={(e) => setWithdrawalDate(e.target.value)}
                />
              </label>
            </div>
            {withdrawalPreview && (
              <div className="balance-box">
                {withdrawalType === "principal" ? "أصل المبلغ المتاح للسحب حتى هذا التاريخ: " : "الفوائد المستحقة المتاحة للسحب حتى هذا التاريخ: "}
                <b>
                  {money(
                    Math.max(
                      0,
                      withdrawalType === "principal" ? withdrawalPreview.principalAvailable : withdrawalPreview.interestAvailable,
                    ),
                  )}
                </b>
              </div>
            )}
            <div className="form-grid">
              <label>
                قيمة السحب
                <input name="amount" type="number" min="1" step="0.01" required defaultValue={editingWithdrawal?.withdrawal.amount} />
              </label>
              <label className="wide">
                بيان / ملاحظة
                <input name="note" defaultValue={editingWithdrawal?.withdrawal.note} placeholder="مثال: تحويل بنكي للعميل" />
              </label>
            </div>
            <button className="primary submit">{editingWithdrawal ? "حفظ التعديلات" : "تسجيل السحب"}</button>
          </form>
        </Modal>
      )}

      {modal === "settle" && (
        <Modal title="تصفية الحساب بالكامل" close={() => setModal(null)}>
          <form className="form" onSubmit={saveSettlement}>
            <div className="form-hint">
              يسجّل هذا الإجراء سحب أصل المبلغ المتبقي والفوائد المستحقة معًا في عمليتين مرتبطتين، بحيث يصبح رصيد
              العميل صفرًا حتى التاريخ المختار — يُستخدم عند تصفية استثمار العميل بالكامل.
            </div>
            <div className="form-grid">
              <label className="wide">
                العميل
                <select name="clientId" required value={settleClientId} onChange={(e) => setSettleClientId(e.target.value)}>
                  <option value="">اختر عميلًا</option>
                  {clientsSorted.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                تاريخ التصفية
                <input name="date" type="date" required value={settleDate} onChange={(e) => setSettleDate(e.target.value)} />
              </label>
              <label className="wide">
                بيان / ملاحظة
                <input name="note" defaultValue="تصفية كاملة للحساب" />
              </label>
            </div>
            {settlePreview && (
              <div className="balance-box">
                أصل المبلغ المتاح: <b>{money(Math.max(0, settlePreview.principalAvailable))}</b>
                {" · "}
                الفوائد المستحقة المتاحة: <b>{money(Math.max(0, settlePreview.interestAvailable))}</b>
                {" · "}
                الإجمالي:{" "}
                <b>
                  {money(
                    Math.max(0, settlePreview.principalAvailable) + Math.max(0, settlePreview.interestAvailable),
                  )}
                </b>
              </div>
            )}
            <button className="primary submit">تأكيد التصفية وتصفير الحساب</button>
          </form>
        </Modal>
      )}

      {modal === "rate" && (
        <Modal title="إضافة / تعديل معدل عائد سنوي" close={() => setModal(null)}>
          <form className="form" onSubmit={saveRate}>
            <div className="form-hint">إذا كانت السنة مسجلة من قبل، سيتم تحديث معدلها تلقائيًا.</div>
            <div className="form-grid">
              <label>
                السنة الميلادية
                <input name="year" type="number" min="2000" max="2100" required defaultValue={new Date().getFullYear()} />
              </label>
              <label>
                المعدل السنوي (%)
                <input name="ratePercent" type="number" min="0" step="0.01" required />
              </label>
            </div>
            <button className="primary submit">حفظ المعدل</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal">
        <div className="modal-head">
          <h2>{title}</h2>
          <button onClick={close}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
