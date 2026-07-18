"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { money as egpMoney, today, uid } from "@/lib/calc";
import {
  Supplier,
  SupplierCurrency,
  SupplierTx,
  SupplierTxType,
  buildSupplierLedger,
  currencySymbol,
  foreignMoney,
  lastRate,
  paginateLedger,
  supplierTitle,
} from "@/lib/suppliers";

const SUPPLIERS_KEY = "athar-suppliers-accounts-suppliers-v1";

const seedSuppliers: Supplier[] = [
  {
    id: "demo",
    name: "مورد تجريبي",
    notes: "بيانات تجريبية — يمكن حذف الحساب والبدء ببياناتك.",
    currency: "AED",
    openingBalance: 0,
    openingDate: "2024-01-01",
    transactions: [],
  },
];

type View = "dashboard" | "suppliers" | "transactions" | "reports";
type Modal = "newSupplier" | "editSupplier" | "tx" | "editTx" | null;

const nav: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "لوحة المتابعة", icon: "◫" },
  { id: "suppliers", label: "حسابات الموردين", icon: "▤" },
  { id: "transactions", label: "الحركات", icon: "◉" },
  { id: "reports", label: "التقارير", icon: "▦" },
];

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editingTx, setEditingTx] = useState<{ supplierId: string; tx: SupplierTx } | null>(null);

  const [txSupplierId, setTxSupplierId] = useState<string>("");
  const [txType, setTxType] = useState<SupplierTxType>("supply");
  const [txAmountInput, setTxAmountInput] = useState<string>("");
  const [txRateInput, setTxRateInput] = useState<string>("");

  const [reportSupplierId, setReportSupplierId] = useState<string>("");
  const [reportDateInput, setReportDateInput] = useState<string>(today());
  const [report, setReport] = useState<{ supplierId: string; asOfDate: string } | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = localStorage.getItem(SUPPLIERS_KEY);
    setSuppliers(saved ? JSON.parse(saved) : seedSuppliers);
    setReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (ready) localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(suppliers));
  }, [suppliers, ready]);

  const suppliersSorted = useMemo(() => [...suppliers].sort((a, b) => a.name.localeCompare(b.name, "ar")), [suppliers]);
  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId) || null;

  const ledgersToday = useMemo(
    () => new Map(suppliers.map((s) => [s.id, buildSupplierLedger(s, today())])),
    [suppliers],
  );
  const allTransactions = useMemo(
    () =>
      suppliers
        .flatMap((s) => s.transactions.map((t) => ({ ...t, supplierId: s.id, supplierName: s.name, currency: s.currency })))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [suppliers],
  );

  const totals = useMemo(() => {
    let supplied = 0;
    let paid = 0;
    let balance = 0;
    ledgersToday.forEach((ledger) => {
      supplied += ledger.summary.totalSuppliedEgp;
      paid += ledger.summary.totalPaid;
      balance += ledger.summary.balance;
    });
    return { supplied, paid, balance };
  }, [ledgersToday]);

  if (!ready) return <main className="loading">جارٍ تجهيز النظام…</main>;

  function saveSupplier(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    if (!name) return;
    const currency = String(fd.get("currency")) as SupplierCurrency;
    const openingBalance = Number(fd.get("openingBalance")) || 0;
    const openingDate = String(fd.get("openingDate") || today());
    if (editingSupplier) {
      setSuppliers((v) =>
        v.map((s) =>
          s.id === editingSupplier.id
            ? {
                ...s,
                name,
                notes: String(fd.get("notes") || ""),
                currency,
                openingBalance,
                openingDate,
              }
            : s,
        ),
      );
      setEditingSupplier(null);
    } else {
      const supplier: Supplier = {
        id: uid(),
        name,
        notes: String(fd.get("notes") || ""),
        currency,
        openingBalance,
        openingDate,
        transactions: [],
      };
      setSuppliers((v) => [...v, supplier]);
      setSelectedSupplierId(supplier.id);
    }
    setModal(null);
  }

  function deleteSupplier(id: string) {
    if (!confirm("حذف هذا المورد وكل بياناته (التوريدات والسدادات)؟")) return;
    setSuppliers((v) => v.filter((s) => s.id !== id));
    if (selectedSupplierId === id) setSelectedSupplierId("");
  }

  function saveTx(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!txSupplierId) return;
    const fd = new FormData(e.currentTarget);
    const date = String(fd.get("date"));
    const amount = Number(fd.get("amount"));
    const rate = txType === "supply" ? Number(fd.get("rate")) : undefined;
    const note = String(fd.get("note") || "");
    if (!date || amount <= 0 || (txType === "supply" && (!rate || rate <= 0))) return;
    if (editingTx) {
      setSuppliers((v) =>
        v.map((s) =>
          s.id === editingTx.supplierId
            ? {
                ...s,
                transactions: s.transactions.map((t) =>
                  t.id === editingTx.tx.id ? { ...t, date, type: txType, amount, rate, note } : t,
                ),
              }
            : s,
        ),
      );
      setEditingTx(null);
    } else {
      setSuppliers((v) =>
        v.map((s) =>
          s.id === txSupplierId
            ? { ...s, transactions: [...s.transactions, { id: uid(), date, type: txType, amount, rate, note }] }
            : s,
        ),
      );
    }
    setModal(null);
  }

  function deleteTx(supplierId: string, txId: string) {
    if (!confirm("حذف هذه الحركة؟")) return;
    setSuppliers((v) =>
      v.map((s) => (s.id === supplierId ? { ...s, transactions: s.transactions.filter((t) => t.id !== txId) } : s)),
    );
  }

  function openTxModal(supplierId: string, type: SupplierTxType = "supply") {
    setEditingTx(null);
    setTxSupplierId(supplierId);
    setTxType(type);
    setTxAmountInput("");
    const supplier = suppliers.find((s) => s.id === supplierId);
    setTxRateInput(type === "supply" && supplier ? String(lastRate(supplier) ?? "") : "");
    setModal("tx");
  }

  function openEditTxModal(supplierId: string, tx: SupplierTx) {
    setEditingTx({ supplierId, tx });
    setTxSupplierId(supplierId);
    setTxType(tx.type);
    setTxAmountInput(String(tx.amount));
    setTxRateInput(String(tx.rate ?? ""));
    setModal("editTx");
  }

  function generateReport() {
    const supplier = suppliers.find((s) => s.id === reportSupplierId);
    if (!supplier) {
      alert("اختر موردًا لعرض تقريره.");
      return;
    }
    if (!reportDateInput) return;
    setReport({ supplierId: supplier.id, asOfDate: reportDateInput });
  }

  const reportSupplier = report ? suppliers.find((s) => s.id === report.supplierId) : null;
  const txSupplier = suppliers.find((s) => s.id === txSupplierId) || null;
  const computedEgp = txSupplier && txType === "supply" ? (Number(txAmountInput) || 0) * (Number(txRateInput) || 0) : 0;

  return (
    <div className="app" dir="rtl">
      <aside className="sidebar print-hide">
        <div className="brand">
          <div>
            <strong>حسابات الموردين</strong>
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
          <Link href="/" className="side-link">
            ← كل الخدمات
          </Link>
          <small>البيانات محفوظة على هذا الجهاز</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar print-hide">
          <div>
            <h1>{nav.find((n) => n.id === view)?.label}</h1>
            <p>حسابات الموردين بعملة الدرهم أو الريال، وسداداتهم بالجنيه المصري على دفعات</p>
          </div>
          <div className="header-actions">
            {view === "suppliers" && (
              <button
                className="primary"
                onClick={() => {
                  setEditingSupplier(null);
                  setModal("newSupplier");
                }}
              >
                ＋ مورد جديد
              </button>
            )}
          </div>
        </header>

        {view === "dashboard" && (
          <>
            <section className="stats four-col">
              <article>
                <span className="stat-icon blue">◉</span>
                <div>
                  <small>عدد الموردين</small>
                  <b>{suppliers.length}</b>
                  <em>حساب مورد نشط</em>
                </div>
              </article>
              <article>
                <span className="stat-icon green">✓</span>
                <div>
                  <small>إجمالي التوريدات</small>
                  <b>{egpMoney(totals.supplied)}</b>
                  <em>بالجنيه المصري حتى اليوم</em>
                </div>
              </article>
              <article>
                <span className="stat-icon gold">٪</span>
                <div>
                  <small>إجمالي المسدد للموردين</small>
                  <b>{egpMoney(totals.paid)}</b>
                  <em>حتى تاريخ اليوم</em>
                </div>
              </article>
              <article>
                <span className="stat-icon red">◫</span>
                <div>
                  <small>إجمالي المستحق للموردين</small>
                  <b>{egpMoney(totals.balance)}</b>
                  <em>رصيد قائم لم يُسدَّد بعد</em>
                </div>
              </article>
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>ملخص حسابات الموردين</h2>
                  <p>محسوب حتى تاريخ اليوم {today()}</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>المورد</th>
                      <th>العملة</th>
                      <th>إجمالي التوريد</th>
                      <th>إجمالي المسدد</th>
                      <th>الرصيد المستحق</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliersSorted.length ? (
                      suppliersSorted.map((s) => {
                        const ledger = ledgersToday.get(s.id)!;
                        return (
                          <tr key={s.id}>
                            <td>
                              <button
                                className="text-btn"
                                onClick={() => {
                                  setSelectedSupplierId(s.id);
                                  setView("suppliers");
                                }}
                              >
                                <b>{s.name}</b>
                              </button>
                            </td>
                            <td>
                              <span className={`badge ${s.currency === "AED" ? "aed" : "sar"}`}>{currencySymbol(s.currency)}</span>
                            </td>
                            <td>{egpMoney(ledger.summary.totalSuppliedEgp)}</td>
                            <td>{egpMoney(ledger.summary.totalPaid)}</td>
                            <td>
                              <b>{egpMoney(ledger.summary.balance)}</b>
                            </td>
                            <td>
                              <button
                                className="text-btn"
                                onClick={() => {
                                  setReportSupplierId(s.id);
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
                        <td colSpan={6} className="empty">
                          لا يوجد موردون مسجلون بعد
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {view === "suppliers" && (
          <section className="content-stack">
            {!selectedSupplierId ? (
              <div className="companies-grid">
                {suppliersSorted.map((s) => {
                  const ledger = ledgersToday.get(s.id)!;
                  return (
                    <button className="company-card" key={s.id} onClick={() => setSelectedSupplierId(s.id)}>
                      <span className="company-dot">{s.name.slice(0, 1)}</span>
                      <div>
                        <h3>{s.name}</h3>
                        <p>
                          {currencySymbol(s.currency)} · {s.transactions.length} حركة
                        </p>
                      </div>
                      <div className="company-money">
                        <small>الرصيد المستحق اليوم</small>
                        <b>{egpMoney(ledger.summary.balance)}</b>
                        <em>توريد {egpMoney(ledger.summary.totalSuppliedEgp)}</em>
                      </div>
                      <strong className="arrow">←</strong>
                    </button>
                  );
                })}
                {suppliers.length === 0 && (
                  <div className="empty-state">لا يوجد موردون مسجلون. أضف أول حساب مورد للبدء.</div>
                )}
              </div>
            ) : selectedSupplier ? (
              <>
                <div className="company-tools print-hide">
                  <button className="secondary" onClick={() => setSelectedSupplierId("")}>
                    → كل الموردين
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setEditingSupplier(selectedSupplier);
                      setModal("editSupplier");
                    }}
                  >
                    تعديل بيانات المورد
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setReportSupplierId(selectedSupplier.id);
                      setReportDateInput(today());
                      setReport(null);
                      setView("reports");
                    }}
                  >
                    تقرير بتاريخ محدد
                  </button>
                  <button className="danger-link" onClick={() => deleteSupplier(selectedSupplier.id)}>
                    حذف المورد
                  </button>
                </div>
                <div className="contract-card">
                  <div className="contract-top">
                    <div>
                      <span className="company-dot">{selectedSupplier.name.slice(0, 1)}</span>
                      <div>
                        <h3>{supplierTitle(selectedSupplier.name)}</h3>
                        <p>
                          {currencySymbol(selectedSupplier.currency)} · {selectedSupplier.notes || "بدون ملاحظات"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="subhead">
                    <b>حركة الحساب بالتسلسل الزمني</b>
                    <div className="tx-type-actions">
                      <button
                        type="button"
                        className="tx-btn-supply"
                        onClick={() => openTxModal(selectedSupplier.id, "supply")}
                      >
                        ＋ توريد جديد
                      </button>
                      <button
                        type="button"
                        className="tx-btn-payment"
                        onClick={() => openTxModal(selectedSupplier.id, "payment")}
                      >
                        ＋ سداد جديد
                      </button>
                    </div>
                  </div>
                  <SupplierStatement
                    supplier={selectedSupplier}
                    asOfDate={today()}
                    editable
                    onEdit={(tx) => openEditTxModal(selectedSupplier.id, tx)}
                    onDelete={(txId) => deleteTx(selectedSupplier.id, txId)}
                  />
                </div>
              </>
            ) : null}
          </section>
        )}

        {view === "transactions" && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>كل حركات الموردين</h2>
                <p>مرتبة من الأحدث إلى الأقدم لكل الموردين</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>المورد</th>
                    <th>التاريخ</th>
                    <th>النوع</th>
                    <th>المبلغ</th>
                    <th>القيمة بالجنيه</th>
                    <th>بيان</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {allTransactions.length ? (
                    allTransactions.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <button
                            className="text-btn"
                            onClick={() => {
                              setSelectedSupplierId(t.supplierId);
                              setView("suppliers");
                            }}
                          >
                            <b>{t.supplierName}</b>
                          </button>
                        </td>
                        <td>{t.date}</td>
                        <td>
                          <span className={`badge ${t.type === "supply" ? "deposit" : "withdrawal"}`}>
                            {t.type === "supply" ? "توريد" : "سداد"}
                          </span>
                        </td>
                        <td>{t.type === "supply" ? foreignMoney(t.amount, t.currency) : egpMoney(t.amount)}</td>
                        <td>{t.type === "supply" ? egpMoney(t.amount * (t.rate || 0)) : "—"}</td>
                        <td>{t.note || "—"}</td>
                        <td>
                          <div className="payment-actions">
                            <button className="edit-payment" onClick={() => openEditTxModal(t.supplierId, t)}>
                              تعديل
                            </button>
                            <button className="delete-payment" onClick={() => deleteTx(t.supplierId, t.id)}>
                              حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="empty">
                        لا توجد حركات مسجلة بعد
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
                <h2>كشف حساب المورد</h2>
                <p>اختر المورد وتاريخ عرض التقرير، ثم اضغط «عرض التقرير» لحساب كل الحركات حتى هذا التاريخ</p>
              </div>
            </div>
            <div className="panel print-hide">
              <div style={{ padding: 22 }}>
                <div className="report-toolbar">
                  <label>
                    المورد
                    <select value={reportSupplierId} onChange={(e) => setReportSupplierId(e.target.value)}>
                      <option value="">اختر موردًا</option>
                      {suppliersSorted.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
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
                    <button className="secondary" onClick={() => window.print()}>
                      طباعة / حفظ PDF
                    </button>
                  )}
                </div>
              </div>
            </div>

            {report && reportSupplier && (
              <>
                <div className="print-title">
                  <h1>كشف حساب — حسابات الموردين</h1>
                  <p>تاريخ التقرير {report.asOfDate}</p>
                </div>
                <SupplierStatement supplier={reportSupplier} asOfDate={report.asOfDate} />
              </>
            )}
            {!report && (
              <div className="panel">
                <div className="empty">اختر موردًا وتاريخًا ثم اضغط «عرض التقرير» لعرض كشف الحساب</div>
              </div>
            )}
          </section>
        )}
      </main>

      {(modal === "newSupplier" || modal === "editSupplier") && (
        <Modal title={editingSupplier ? `تعديل بيانات — ${editingSupplier.name}` : "مورد جديد"} close={() => setModal(null)}>
          <form className="form" onSubmit={saveSupplier}>
            <div className="form-grid">
              <label className="wide">
                اسم المورد
                <input name="name" required defaultValue={editingSupplier?.name} />
              </label>
              <label>
                عملة المورد
                <select name="currency" defaultValue={editingSupplier?.currency || "AED"}>
                  <option value="AED">د.أ</option>
                  <option value="SAR">ر.س</option>
                </select>
              </label>
              <label>
                الرصيد السابق (جنيه مصري)
                <input name="openingBalance" type="number" step="0.01" defaultValue={editingSupplier?.openingBalance ?? 0} />
              </label>
              <label>
                تاريخ الرصيد السابق
                <input name="openingDate" type="date" required defaultValue={editingSupplier?.openingDate || today()} />
              </label>
              <label className="wide">
                ملاحظات
                <input name="notes" defaultValue={editingSupplier?.notes} />
              </label>
            </div>
            <button className="primary submit">{editingSupplier ? "حفظ التعديلات" : "إضافة المورد"}</button>
          </form>
        </Modal>
      )}

      {(modal === "tx" || modal === "editTx") && txSupplier && (
        <Modal title={editingTx ? "تعديل حركة" : `حركة جديدة — ${txSupplier.name}`} close={() => setModal(null)}>
          <form className="form" onSubmit={saveTx}>
            <div className="form-grid">
              <label>
                نوع الحركة
                <select
                  value={txType}
                  onChange={(e) => {
                    const nextType = e.target.value as SupplierTxType;
                    setTxType(nextType);
                    if (nextType === "supply" && !editingTx && !txRateInput) {
                      setTxRateInput(String(lastRate(txSupplier) ?? ""));
                    }
                  }}
                >
                  <option value="supply">توريد (وارد بعملة المورد)</option>
                  <option value="payment">سداد (مصروف بالجنيه المصري)</option>
                </select>
              </label>
              <label>
                التاريخ
                <input name="date" type="date" required defaultValue={editingTx?.tx.date || today()} />
              </label>
              <label>
                {txType === "supply" ? `المبلغ (${currencySymbol(txSupplier.currency)})` : "المبلغ (جنيه مصري)"}
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={txAmountInput}
                  onChange={(e) => setTxAmountInput(e.target.value)}
                />
              </label>
              {txType === "supply" && (
                <label>
                  معامل الصرف
                  <input
                    name="rate"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    required
                    value={txRateInput}
                    onChange={(e) => setTxRateInput(e.target.value)}
                  />
                </label>
              )}
              <label className="wide">
                بيان / ملاحظة
                <input
                  name="note"
                  defaultValue={editingTx?.tx.note}
                  placeholder={txType === "supply" ? "مثال: تحويل آثار" : "مثال: تحويل CIB"}
                />
              </label>
            </div>
            {txType === "supply" && computedEgp > 0 && (
              <div className="calculation-box">
                القيمة بالجنيه المصري
                <strong>{egpMoney(computedEgp)}</strong>
              </div>
            )}
            <button className="primary submit">{editingTx ? "حفظ التعديلات" : "إضافة الحركة"}</button>
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

/**
 * كشف حساب موحّد لمورد واحد: يجمع الرصيد السابق والتوريدات والسدادات في جدول واحد بالتسلسل
 * الزمني مع الرصيد بعد كل حركة، ويُقسَّم تلقائيًا إلى كشوف بحد أقصى 15 معاملة لكل كشف — كل
 * كشف بعد الأول يبدأ برصيد مرحّل، وأرقام التسلسل تبقى مستمرة عبر كل الكشوف لإمكانية المراجعة.
 */
function SupplierStatement({
  supplier,
  asOfDate,
  editable = false,
  onEdit,
  onDelete,
}: {
  supplier: Supplier;
  asOfDate: string;
  editable?: boolean;
  onEdit?: (tx: SupplierTx) => void;
  onDelete?: (txId: string) => void;
}) {
  const ledger = useMemo(() => buildSupplierLedger(supplier, asOfDate), [supplier, asOfDate]);
  const sheets = useMemo(() => paginateLedger(ledger.rows), [ledger.rows]);
  const [sheetIndex, setSheetIndex] = useState(sheets.length - 1);
  const prevSheetCount = useRef(sheets.length);
  const captureRef = useRef<HTMLDivElement>(null);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (sheets.length !== prevSheetCount.current) {
      setSheetIndex(sheets.length - 1);
      prevSheetCount.current = sheets.length;
    }
  }, [sheets.length]);

  const sheet = sheets[Math.min(sheetIndex, sheets.length - 1)];
  const txById = useMemo(() => new Map(supplier.transactions.map((t) => [t.id, t])), [supplier.transactions]);

  const sheetPaid = sheet.rows.filter((r) => r.kind === "payment").reduce((sum, r) => sum + -r.egpDelta, 0);
  const sheetForeign = sheet.rows.filter((r) => r.kind === "supply").reduce((sum, r) => sum + (r.currencyAmount || 0), 0);
  const sheetClosing = sheet.rows.length ? sheet.rows[sheet.rows.length - 1].balanceAfter : supplier.openingBalance;
  const columnCount = editable ? 8 : 7;

  async function copyAsImage() {
    if (!captureRef.current) return;
    setCopying(true);
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(captureRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        filter: (node) => !(node instanceof HTMLElement && node.classList.contains("capture-hide")),
      });
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `كشف حساب - ${supplier.name} - كشف ${sheet.index}.png`;
        link.click();
      }
    } catch {
      alert("تعذّر نسخ الحساب كصورة على هذا المتصفح.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div>
      <div ref={captureRef}>
        <div className="statement-head print-hide">
          <div>
            <h2 className="client-name">{supplierTitle(supplier.name)}</h2>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>{currencySymbol(supplier.currency)}</p>
          </div>
          <div className="as-of">
            <small style={{ color: "var(--muted)", fontSize: 11 }}>محسوب حتى تاريخ</small>
            <b>{asOfDate}</b>
          </div>
        </div>
  
        <div className="report-summary print-keep" style={{ margin: "0 0 18px" }}>
          <span>
            الرصيد السابق <b>{egpMoney(Math.round(supplier.openingBalance))}</b>
          </span>
          <span>
            إجمالي التوريدات <b>{foreignMoney(ledger.summary.totalSuppliedForeign, supplier.currency)}</b>
          </span>
          <span>
            إجمالي المسدد <b>{egpMoney(Math.round(ledger.summary.totalPaid))}</b>
          </span>
          <span>
            الرصيد المستحق للمورد <b>{egpMoney(Math.round(ledger.summary.balance))}</b>
          </span>
        </div>
  
        {sheets.length > 1 && (
          <div className="tabs print-hide capture-hide">
            {sheets.map((s) => (
              <button key={s.index} className={s.index === sheet.index ? "active" : ""} onClick={() => setSheetIndex(s.index - 1)}>
                كشف رقم {s.index}
              </button>
            ))}
          </div>
        )}
  
        <div className="panel report-table supplier-report-table">
          {sheets.length > 1 && (
            <div className="panel-head">
              <div>
                <h2>
                  كشف رقم {sheet.index} من {sheet.total}
                </h2>
                <p>أرشيف حساب {supplier.name} — الأرقام مستمرة عبر كل الكشوف لإمكانية المراجعة</p>
              </div>
            </div>
          )}
          <table className="ledger-table supplier-ledger">
            <thead>
              <tr>
                <th rowSpan={2}>م</th>
                <th rowSpan={2} className="balance-col">
                  رصيد
                </th>
                <th colSpan={2}>وارد</th>
                <th rowSpan={2} className="expense-col">
                  مصروف
                </th>
                <th rowSpan={2} className="label-col">
                  بيان
                </th>
                <th rowSpan={2}>تاريخ</th>
                {editable && <th rowSpan={2} className="print-hide capture-hide"></th>}
              </tr>
              <tr>
                <th>{`مبلغ (${currencySymbol(supplier.currency)})`}</th>
                <th className="rate-col">معدل</th>
              </tr>
            </thead>
            <tbody>
              {sheet.rows.length ? (
                sheet.rows.map((row) => (
                  <tr
                    key={row.id}
                    className={
                      row.kind === "supply"
                        ? "row-deposit"
                        : row.kind === "payment"
                          ? "row-withdrawal"
                          : row.kind === "carry"
                            ? "row-carry"
                            : ""
                    }
                  >
                    <td>{row.kind === "carry" ? "—" : row.seq}</td>
                    <td className="balance-col">
                      <b>{egpMoney(Math.round(row.balanceAfter))}</b>
                    </td>
                    <td>{row.kind === "supply" ? Math.round(row.currencyAmount || 0) : ""}</td>
                    <td className="rate-col">{row.kind === "supply" ? row.rate : ""}</td>
                    <td className="expense-col">{row.kind === "payment" ? egpMoney(Math.round(-row.egpDelta)) : ""}</td>
                    <td className="label-col">{row.label}</td>
                    <td>{row.date}</td>
                    {editable && (
                      <td className="print-hide capture-hide">
                        {(row.kind === "supply" || row.kind === "payment") && (
                          <div className="payment-actions">
                            <button className="edit-payment" onClick={() => onEdit?.(txById.get(row.id)!)}>
                              تعديل
                            </button>
                            <button className="delete-payment" onClick={() => onDelete?.(row.id)}>
                              حذف
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columnCount} className="empty">
                    لا توجد حركات محسوبة حتى هذا التاريخ
                  </td>
                </tr>
              )}
            </tbody>
            {sheet.rows.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td></td>
                  <td className="balance-final balance-col">{egpMoney(Math.round(sheetClosing))}</td>
                  <td>{Math.round(sheetForeign)}</td>
                  <td className="rate-col"></td>
                  <td className="expense-col">{egpMoney(Math.round(sheetPaid))}</td>
                  <td colSpan={2}>الإجمالي — كشف رقم {sheet.index}</td>
                  {editable && <td className="print-hide capture-hide"></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="print-hide" style={{ marginTop: 14 }}>
        <button className="secondary" onClick={copyAsImage} disabled={copying}>
          {copying ? "جارٍ نسخ الحساب…" : copied ? "✓ تم النسخ" : "⧉ نسخ الحساب كصورة"}
        </button>
      </div>
    </div>
  );
}
