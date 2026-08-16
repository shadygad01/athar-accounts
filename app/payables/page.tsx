"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { money, today, uid } from "@/lib/calc";
import {
  PayableAccount,
  PayableEntry,
  PayableEntryType,
  PayableStatementArchive,
  buildPayableAccountTotals,
  buildPayableLedger,
} from "@/lib/payables";

const PAYABLES_KEY = "athar-accounts-payable-v1";
type Modal = "account" | "entry" | null;

export default function PayablesPage() {
  const [accounts, setAccounts] = useState<PayableAccount[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [editingAccount, setEditingAccount] = useState<PayableAccount | null>(null);
  const [editingEntry, setEditingEntry] = useState<PayableEntry | null>(null);
  const [entryType, setEntryType] = useState<PayableEntryType>("obligation");
  const reportRef = useRef<HTMLDivElement>(null);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedArchiveId, setSelectedArchiveId] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveFrom, setArchiveFrom] = useState("");
  const [archiveTo, setArchiveTo] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PAYABLES_KEY);
      setAccounts(saved ? JSON.parse(saved) : []);
    } catch {
      setAccounts([]);
    } finally {
      setReady(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (ready) localStorage.setItem(PAYABLES_KEY, JSON.stringify(accounts));
  }, [accounts, ready]);

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => a.name.localeCompare(b.name, "ar")),
    [accounts],
  );
  const selected = accounts.find((account) => account.id === selectedId) || null;
  const selectedArchive = selected?.archives?.find((archive) => archive.id === selectedArchiveId) || null;
  const ledger = useMemo(
    () => selected
      ? buildPayableLedger(selectedArchive ? { ...selected, entries: selectedArchive.entries } : selected)
      : null,
    [selected, selectedArchive],
  );
  const accountTotals = useMemo(
    () => selected ? buildPayableAccountTotals(selected) : null,
    [selected],
  );

  function saveAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    if (!name) return;
    const notes = String(data.get("notes") || "").trim();

    if (editingAccount) {
      setAccounts((current) =>
        current.map((account) =>
          account.id === editingAccount.id ? { ...account, name, notes } : account,
        ),
      );
    } else {
      const account: PayableAccount = { id: uid(), name, notes, entries: [] };
      setAccounts((current) => [...current, account]);
      setSelectedId(account.id);
    }
    setEditingAccount(null);
    setModal(null);
  }

  function saveEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    const date = String(data.get("date") || "");
    const note = String(data.get("note") || "").trim();
    if (!date || amount <= 0) return;

    setAccounts((current) =>
      current.map((account) => {
        if (account.id !== selected.id) return account;
        const entry: PayableEntry = {
          id: editingEntry?.id || uid(),
          type: entryType,
          date,
          amount,
          note,
        };
        return {
          ...account,
          entries: editingEntry
            ? account.entries.map((item) => (item.id === editingEntry.id ? entry : item))
            : [...account.entries, entry],
        };
      }),
    );
    setEditingEntry(null);
    setModal(null);
  }

  function openNewEntry(type: PayableEntryType) {
    setEditingEntry(null);
    setEntryType(type);
    setModal("entry");
  }

  function deleteAccount() {
    if (!selected || !confirm(`حذف حساب «${selected.name}» وكل الالتزامات ودفعات السداد المسجلة به؟`)) return;
    setAccounts((current) => current.filter((account) => account.id !== selected.id));
    setSelectedId("");
  }

  function createNewStatement() {
    if (!selected) return;
    if (!selected.entries.length) {
      alert("الكشف الحالي فارغ ولا توجد حركات لحفظها في الأرشيف.");
      return;
    }
    const currentLedger = buildPayableLedger(selected);
    const closingBalance = currentLedger.balance;
    const balanceLabel = Math.abs(closingBalance) < 0.005 ? "صفر" : money(closingBalance);
    if (!confirm(`سيتم حفظ الكشف الحالي كاملًا في الأرشيف وبدء كشف جديد برصيد مرحّل ${balanceLabel}. هل تريد المتابعة؟`)) return;

    const archivedAt = new Date().toISOString();
    const archive: PayableStatementArchive = {
      id: uid(),
      archivedAt,
      entries: selected.entries.map((entry) => ({ ...entry })),
      closingBalance,
    };
    const carriedEntries: PayableEntry[] = Math.abs(closingBalance) < 0.005 ? [] : [{
      id: `opening-${archive.id}`,
      type: closingBalance >= 0 ? "obligation" : "payment",
      date: today(),
      amount: Math.abs(closingBalance),
      note: "رصيد مرحّل من الكشف السابق",
      isOpening: true,
    }];
    setAccounts((current) => current.map((account) => account.id === selected.id ? {
      ...account,
      entries: carriedEntries,
      archives: [...(account.archives || []), archive],
    } : account));
    setSelectedArchiveId("");
  }

  function deleteEntry(entryId: string) {
    if (!selected || !confirm("حذف هذه الحركة من كشف الحساب؟")) return;
    setAccounts((current) =>
      current.map((account) =>
        account.id === selected.id
          ? { ...account, entries: account.entries.filter((entry) => entry.id !== entryId) }
          : account,
      ),
    );
  }

  async function copyReportAsImage() {
    if (!reportRef.current || !selected) return;
    setCopying(true);
    reportRef.current.classList.add("capturing-payable-report");
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(reportRef.current, {
        backgroundColor: "#f5f7f8",
        pixelRatio: 2,
        filter: (node) => !(node instanceof HTMLElement && node.classList.contains("capture-hide")),
      });
      if (!blob) throw new Error("تعذر إنشاء الصورة");
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `كشف حساب - ${selected.name}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }
    } catch {
      alert("تعذر نسخ التقرير كصورة على هذا المتصفح.");
    } finally {
      reportRef.current?.classList.remove("capturing-payable-report");
      setCopying(false);
    }
  }

  if (!ready) return <main className="loading">جارٍ تجهيز الحسابات الدائنة…</main>;

  return (
    <div className="app" dir="rtl">
      <aside className="sidebar print-hide">
        <div className="brand"><div><strong>الحسابات الدائنة</strong><small>Accounts Payable</small></div></div>
        <nav>
          <button className={!selected ? "active" : ""} onClick={() => setSelectedId("")}>
            <span>▤</span> أصحاب الالتزامات
          </button>
          {selected && <button className="active"><span>◉</span> كشف الحساب</button>}
        </nav>
        <div className="side-actions">
          <Link href="/different-accounts" className="side-link">→ حسابات مختلفة</Link>
          <Link href="/suppliers" className="side-link">→ حسابات الموردين</Link>
          <Link href="/" className="side-link">← كل الخدمات</Link>
          <small>البيانات محفوظة على هذا الجهاز</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar print-hide">
          <div>
            <h1>{selected ? `كشف حساب — ${selected.name}` : "الحسابات الدائنة"}</h1>
            <p>تسجيل المبالغ المستحقة لأطراف أخرى ومتابعة سدادها على دفعات</p>
          </div>
          {!selected && (
            <button className="primary" onClick={() => { setEditingAccount(null); setModal("account"); }}>
              ＋ إنشاء التزام
            </button>
          )}
        </header>

        {!selected ? (
          <section className="content-stack">
            <div className="payables-summary-note">
              الحسابات هنا مستقلة عن العملاء والموردين، ومناسبة للسلف والتسويات وأي مبالغ دائنة لأطراف أخرى.
            </div>
            <div className="companies-grid">
              {sortedAccounts.map((account) => {
                const result = buildPayableLedger(account);
                const totals = buildPayableAccountTotals(account);
                return (
                  <button className="company-card" key={account.id} onClick={() => setSelectedId(account.id)}>
                    <span className="company-dot">{account.name.slice(0, 1)}</span>
                    <div><h3>{account.name}</h3><p>{account.entries.length} حركة مسجلة</p></div>
                    <div className="company-money">
                      <small>المبلغ المتبقي</small>
                      <b>{money(result.balance)}</b>
                      <em>تم سداد {money(totals.totalPayments)}</em>
                    </div>
                    <strong className="arrow">←</strong>
                  </button>
                );
              })}
              {!accounts.length && (
                <div className="empty-state">لا توجد حسابات دائنة بعد. اضغط «إنشاء التزام» لإضافة أول حساب.</div>
              )}
            </div>
          </section>
        ) : ledger ? (
          <section className="content-stack">
            <div className="company-tools print-hide">
              <button className="secondary" onClick={() => { setSelectedId(""); setSelectedArchiveId(""); }}>→ كل أصحاب الالتزامات</button>
              {selectedArchive ? (
                <button className="primary" onClick={() => setSelectedArchiveId("")}>العودة للكشف الحالي</button>
              ) : (
                <button className="primary" onClick={createNewStatement}>＋ إنشاء كشف جديد</button>
              )}
              {(selected.archives?.length || 0) > 0 && (
                <button className="secondary" onClick={() => setArchiveOpen(true)}>أرشيف ({selected.archives?.length})</button>
              )}
              {!selectedArchive && <>
              <button className="secondary" onClick={() => { setEditingAccount(selected); setModal("account"); }}>تعديل الاسم والبيانات</button>
              <button className="secondary" onClick={copyReportAsImage} disabled={copying}>
                {copying ? "جارٍ تجهيز الصورة…" : copied ? "✓ تم نسخ التقرير" : "⧉ نسخ التقرير كصورة"}
              </button>
              <button className="danger-link" onClick={deleteAccount}>حذف الحساب</button>
              </>}
            </div>

            <div ref={reportRef} className="payable-report-capture">
              <div className="contract-card payable-account-head">
                <div className="contract-top">
                  <div><span className="company-dot">{selected.name.slice(0, 1)}</span><div><h3>{selected.name}</h3><p>{selected.notes || "بدون ملاحظات"}</p></div></div>
                  {!selectedArchive && <div className="tx-type-actions print-hide capture-hide">
                    <button className="tx-btn-supply" onClick={() => openNewEntry("obligation")}>＋ إضافة التزام</button>
                    <button className="tx-btn-payment" onClick={() => openNewEntry("payment")}>＋ دفعة سداد</button>
                  </div>}
                </div>
              </div>

              <div className="stats payable-stats">
                <article><span className="stat-icon blue">＋</span><div><small>إجمالي الالتزامات</small><b>{money(selectedArchive ? ledger.totalObligations : accountTotals?.totalObligations || 0)}</b></div></article>
                <article><span className="stat-icon green">✓</span><div><small>إجمالي المسدد</small><b>{money(selectedArchive ? ledger.totalPayments : accountTotals?.totalPayments || 0)}</b></div></article>
                <article><span className="stat-icon red">◫</span><div><small>الرصيد المتبقي</small><b>{money(ledger.balance)}</b></div></article>
              </div>

              <div className="panel report-table payable-report-table">
                <div className="panel-head"><div><h2>{selectedArchive ? `كشف حساب مؤرشف — كشف ${selected.archives!.findIndex((item) => item.id === selectedArchive.id) + 1}` : "كشف الحساب الحالي"}</h2><p>كل الالتزامات ودفعات السداد مرتبة زمنيًا في كشف كامل دون فواصل</p></div></div>
                <div className="table-wrap">
                  <table>
                    <colgroup>
                      <col className="payable-date-col" />
                      <col className="payable-note-col" />
                      <col className="payable-money-col" />
                      <col className="payable-money-col" />
                      <col className="payable-balance-col" />
                      {!selectedArchive && <col className="payable-actions-col capture-hide" />}
                    </colgroup>
                    <thead><tr><th>التاريخ</th><th>البيان</th><th>التزام</th><th>سداد</th><th>الرصيد</th>{!selectedArchive && <th className="print-hide capture-hide">إجراءات</th>}</tr></thead>
                    <tbody>
                      {ledger.rows.map((row) => (
                        <tr key={row.id} className={row.type === "payment" ? "row-withdrawal" : "row-deposit"}>
                          <td>{row.date}</td>
                          <td>{row.note || (row.type === "obligation" ? "إثبات التزام" : "دفعة سداد")}</td>
                          <td>{row.type === "obligation" ? money(row.amount) : "—"}</td>
                          <td>{row.type === "payment" ? money(row.amount) : "—"}</td>
                          <td><b>{money(row.balanceAfter)}</b></td>
                          {!selectedArchive && <td className="print-hide capture-hide">
                            <div className="payment-actions">
                              {!row.isOpening && !row.id.startsWith("opening-") && <><button className="edit-payment" onClick={() => { setEditingEntry(row); setEntryType(row.type); setModal("entry"); }}>تعديل</button>
                              <button className="delete-payment" onClick={() => deleteEntry(row.id)}>حذف</button></>}
                            </div>
                          </td>}
                        </tr>
                      ))}
                      {!ledger.rows.length && <tr><td colSpan={selectedArchive ? 5 : 6} className="empty">لا توجد حركات مسجلة في هذا الحساب بعد.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </main>

      {modal === "account" && (
        <Modal title={editingAccount ? "تعديل بيانات الحساب" : "إنشاء التزام جديد"} close={() => setModal(null)}>
          <form className="form" onSubmit={saveAccount}>
            <div className="form-grid">
              <label className="wide">اسم صاحب الالتزام<input name="name" required autoFocus defaultValue={editingAccount?.name} placeholder="مثال: أحمد محمد" /></label>
              <label className="wide">ملاحظات<input name="notes" defaultValue={editingAccount?.notes} placeholder="سبب الالتزام أو أي بيانات إضافية" /></label>
            </div>
            <button className="primary submit">{editingAccount ? "حفظ التعديلات" : "إنشاء الحساب"}</button>
          </form>
        </Modal>
      )}

      {modal === "entry" && selected && (
        <Modal title={editingEntry ? "تعديل الحركة" : entryType === "obligation" ? "إضافة التزام" : "تسجيل دفعة سداد"} close={() => setModal(null)}>
          <form className="form" onSubmit={saveEntry}>
            <div className="form-grid">
              <label>نوع الحركة<select value={entryType} onChange={(event) => setEntryType(event.target.value as PayableEntryType)}><option value="obligation">التزام جديد</option><option value="payment">دفعة سداد</option></select></label>
              <label>التاريخ<input name="date" type="date" required defaultValue={editingEntry?.date || today()} /></label>
              <label>المبلغ (جنيه مصري)<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={editingEntry?.amount} /></label>
              <label>البيان<input name="note" defaultValue={editingEntry?.note} placeholder={entryType === "obligation" ? "سبب الالتزام" : "طريقة أو مرجع السداد"} /></label>
            </div>
            <button className="primary submit">{editingEntry ? "حفظ التعديلات" : entryType === "obligation" ? "إضافة الالتزام" : "تسجيل السداد"}</button>
          </form>
        </Modal>
      )}

      {archiveOpen && selected && (
        <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setArchiveOpen(false)}>
          <div className="modal archive-modal">
            <div className="modal-head"><div><h2>أرشيف كشوف الحساب</h2><p>اختر الفترة ثم افتح الكشف المطلوب كاملًا.</p></div><button type="button" onClick={() => setArchiveOpen(false)}>×</button></div>
            <div className="statement-archive-browser">
              <div className="archive-date-filter">
                <label>من تاريخ<input type="date" value={archiveFrom} onChange={(event) => setArchiveFrom(event.target.value)} /></label>
                <label>إلى تاريخ<input type="date" value={archiveTo} onChange={(event) => setArchiveTo(event.target.value)} /></label>
                {(archiveFrom || archiveTo) && <button className="secondary" onClick={() => { setArchiveFrom(""); setArchiveTo(""); }}>مسح الفترة</button>}
              </div>
              <div className="archive-results">
                {(selected.archives || []).map((archive, index) => {
                  const period = payableArchivePeriod(archive);
                  const matches = (!archiveFrom || period.end >= archiveFrom) && (!archiveTo || period.start <= archiveTo);
                  return matches ? <button key={archive.id} className={selectedArchiveId === archive.id ? "active" : ""} onClick={() => { setSelectedArchiveId(archive.id); setArchiveOpen(false); }}><b>كشف {index + 1}</b><span>{period.start} ← {period.end}</span><small>المتبقي {money(archive.closingBalance)}</small></button> : null;
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function payableArchivePeriod(archive: PayableStatementArchive) {
  const dates = archive.entries.map((entry) => entry.date).filter(Boolean).sort();
  const fallback = archive.archivedAt.slice(0, 10);
  return { start: dates[0] || fallback, end: dates[dates.length - 1] || fallback };
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="modal">
        <div className="modal-head"><h2>{title}</h2><button type="button" onClick={close}>×</button></div>
        {children}
      </div>
    </div>
  );
}
