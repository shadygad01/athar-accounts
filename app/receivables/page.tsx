"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { money, today, uid } from "@/lib/calc";
import {
  RECEIVABLES_STORAGE_KEY,
  ReceivableAccount,
  ReceivableEntry,
  ReceivableEntryType,
  buildReceivableLedger,
  receivableDaysAway,
} from "@/lib/receivables";

type Modal = "account" | "entry" | null;

export default function ReceivablesPage() {
  const [accounts, setAccounts] = useState<ReceivableAccount[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [editingAccount, setEditingAccount] = useState<ReceivableAccount | null>(null);
  const [editingEntry, setEditingEntry] = useState<ReceivableEntry | null>(null);
  const [entryType, setEntryType] = useState<ReceivableEntryType>("advance");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECEIVABLES_STORAGE_KEY);
      setAccounts(saved ? JSON.parse(saved) : []);
    } catch {
      setAccounts([]);
    } finally {
      setReady(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (ready) localStorage.setItem(RECEIVABLES_STORAGE_KEY, JSON.stringify(accounts));
  }, [accounts, ready]);

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => a.name.localeCompare(b.name, "ar")),
    [accounts],
  );
  const selected = accounts.find((account) => account.id === selectedId) || null;
  const ledger = useMemo(() => selected ? buildReceivableLedger(selected) : null, [selected]);

  function saveAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const dueDate = String(data.get("dueDate") || "");
    const notes = String(data.get("notes") || "").trim();
    if (!name || !dueDate) return;
    if (editingAccount) {
      setAccounts((current) => current.map((account) => account.id === editingAccount.id ? { ...account, name, dueDate, notes } : account));
    } else {
      const account: ReceivableAccount = { id: uid(), name, dueDate, notes, entries: [] };
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
    setAccounts((current) => current.map((account) => {
      if (account.id !== selected.id) return account;
      const entry: ReceivableEntry = { id: editingEntry?.id || uid(), type: entryType, date, amount, note };
      return { ...account, entries: editingEntry ? account.entries.map((item) => item.id === editingEntry.id ? entry : item) : [...account.entries, entry] };
    }));
    setEditingEntry(null);
    setModal(null);
  }

  function openNewEntry(type: ReceivableEntryType) {
    setEditingEntry(null);
    setEntryType(type);
    setModal("entry");
  }

  function deleteAccount() {
    if (!selected || !confirm(`حذف حساب «${selected.name}» وكل السلف ودفعات الرد المسجلة به؟`)) return;
    setAccounts((current) => current.filter((account) => account.id !== selected.id));
    setSelectedId("");
  }

  function deleteEntry(entryId: string) {
    if (!selected || !confirm("حذف هذه الحركة من كشف الحساب؟")) return;
    setAccounts((current) => current.map((account) => account.id === selected.id ? { ...account, entries: account.entries.filter((entry) => entry.id !== entryId) } : account));
  }

  if (!ready) return <main className="loading">جارٍ تجهيز حسابات السلفيات…</main>;

  return (
    <div className="app" dir="rtl">
      <aside className="sidebar print-hide">
        <div className="brand"><div><strong>حسابات مدينة</strong><small>حساب السلفيات</small></div></div>
        <nav>
          <button className={!selected ? "active" : ""} onClick={() => setSelectedId("")}><span>◇</span> أصحاب السلفيات</button>
          {selected && <button className="active"><span>◉</span> كشف حساب السلفة</button>}
        </nav>
        <div className="side-actions">
          <Link href="/different-accounts" className="side-link">→ حسابات مختلفة</Link>
          <Link href="/" className="side-link">← كل الخدمات</Link>
          <small>البيانات محفوظة على هذا الجهاز</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar print-hide">
          <div><h1>{selected ? `حساب السلفيات — ${selected.name}` : "حساب السلفيات"}</h1><p>تسجيل السلفة ومتابعة دفعات ردها وموعد السداد المتوقع</p></div>
          {!selected && <button className="primary" onClick={() => { setEditingAccount(null); setModal("account"); }}>＋ إنشاء حساب سلفة</button>}
        </header>

        {!selected ? (
          <section className="content-stack">
            <div className="payables-summary-note">أنشئ حسابًا باسم صاحب السلفة، ثم سجل مبلغ السلفة وأي دفعات يتم ردها. سيظهر تنبيه في الرئيسية قبل موعد السداد بيومين ما دام هناك مبلغ متبقٍ.</div>
            <div className="companies-grid">
              {sortedAccounts.map((account) => {
                const result = buildReceivableLedger(account);
                const days = receivableDaysAway(account.dueDate);
                return <button className="company-card" key={account.id} onClick={() => setSelectedId(account.id)}>
                  <span className="company-dot">{account.name.slice(0, 1)}</span>
                  <div><h3>{account.name}</h3><p>موعد السداد: {account.dueDate}</p></div>
                  <div className="company-money"><small>المبلغ المتبقي</small><b>{money(result.balance)}</b><em className={days <= 2 && result.balance > 0 ? "receivable-due" : ""}>{result.balance <= 0 ? "تم السداد" : days < 0 ? "متأخر" : days === 0 ? "مستحق اليوم" : `متبقي ${days} يوم`}</em></div>
                  <strong className="arrow">←</strong>
                </button>;
              })}
              {!accounts.length && <div className="empty-state">لا توجد حسابات سلفيات بعد. اضغط «إنشاء حساب سلفة» لإضافة أول حساب.</div>}
            </div>
          </section>
        ) : ledger ? (
          <section className="content-stack">
            <div className="company-tools print-hide">
              <button className="secondary" onClick={() => setSelectedId("")}>→ كل أصحاب السلفيات</button>
              <button className="secondary" onClick={() => { setEditingAccount(selected); setModal("account"); }}>تعديل البيانات والموعد</button>
              <button className="danger-link" onClick={deleteAccount}>حذف الحساب</button>
            </div>
            <div className="contract-card payable-account-head">
              <div className="contract-top"><div><span className="company-dot">{selected.name.slice(0, 1)}</span><div><h3>{selected.name}</h3><p>{selected.notes || "بدون ملاحظات"}</p><small className="receivable-due-date">موعد السداد المتوقع: {selected.dueDate}</small></div></div>
                <div className="tx-type-actions print-hide"><button className="tx-btn-supply" onClick={() => openNewEntry("advance")}>＋ إضافة سلفة</button><button className="tx-btn-payment" onClick={() => openNewEntry("repayment")}>＋ رد السلفة</button></div>
              </div>
            </div>
            <div className="stats payable-stats">
              <article><span className="stat-icon blue">＋</span><div><small>إجمالي السلف</small><b>{money(ledger.totalAdvances)}</b></div></article>
              <article><span className="stat-icon green">✓</span><div><small>إجمالي ما تم رده</small><b>{money(ledger.totalRepayments)}</b></div></article>
              <article><span className="stat-icon red">◫</span><div><small>المبلغ المتبقي</small><b>{money(ledger.balance)}</b></div></article>
            </div>
            <div className="panel report-table payable-report-table">
              <div className="panel-head"><div><h2>كشف حساب السلفة</h2><p>السلف ودفعات الرد مرتبة زمنيًا</p></div></div>
              <div className="table-wrap"><table><colgroup><col className="payable-date-col"/><col className="payable-note-col"/><col className="payable-money-col"/><col className="payable-money-col"/><col className="payable-balance-col"/><col className="payable-actions-col"/></colgroup>
                <thead><tr><th>التاريخ</th><th>البيان</th><th>السلفة</th><th>رد السلفة</th><th>المتبقي</th><th>إجراءات</th></tr></thead>
                <tbody>{ledger.rows.map((row) => <tr key={row.id} className={row.type === "repayment" ? "row-withdrawal" : "row-deposit"}><td>{row.date}</td><td>{row.note || (row.type === "advance" ? "مبلغ سلفة" : "دفعة رد السلفة")}</td><td>{row.type === "advance" ? money(row.amount) : "—"}</td><td>{row.type === "repayment" ? money(row.amount) : "—"}</td><td><b>{money(row.balanceAfter)}</b></td><td><div className="payment-actions"><button className="edit-payment" onClick={() => { setEditingEntry(row); setEntryType(row.type); setModal("entry"); }}>تعديل</button><button className="delete-payment" onClick={() => deleteEntry(row.id)}>حذف</button></div></td></tr>)}
                  {!ledger.rows.length && <tr><td colSpan={6} className="empty">لا توجد حركات مسجلة في هذا الحساب بعد.</td></tr>}
                </tbody></table></div>
            </div>
          </section>
        ) : null}
      </main>

      {modal === "account" && <Modal title={editingAccount ? "تعديل حساب السلفة" : "إنشاء حساب سلفة جديد"} close={() => setModal(null)}><form className="form" onSubmit={saveAccount}><div className="form-grid">
        <label>اسم صاحب السلفة<input name="name" required autoFocus defaultValue={editingAccount?.name} placeholder="مثال: أحمد محمد" /></label>
        <label>ميعاد السداد المتوقع<input name="dueDate" type="date" required defaultValue={editingAccount?.dueDate || today()} /></label>
        <label className="wide">ملاحظات<textarea name="notes" rows={3} defaultValue={editingAccount?.notes} placeholder="سبب السلفة أو أي بيانات إضافية" /></label>
      </div><button className="primary submit">{editingAccount ? "حفظ التعديلات" : "إنشاء الحساب"}</button></form></Modal>}

      {modal === "entry" && selected && <Modal title={editingEntry ? "تعديل الحركة" : entryType === "advance" ? "إضافة مبلغ سلفة" : "تسجيل رد السلفة"} close={() => setModal(null)}><form className="form" onSubmit={saveEntry}><div className="form-grid">
        <label>نوع الحركة<select value={entryType} onChange={(event) => setEntryType(event.target.value as ReceivableEntryType)}><option value="advance">مبلغ سلفة</option><option value="repayment">رد السلفة</option></select></label>
        <label>التاريخ<input name="date" type="date" required defaultValue={editingEntry?.date || today()} /></label>
        <label>المبلغ (جنيه مصري)<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={editingEntry?.amount} /></label>
        <label>البيان / ملاحظات<input name="note" defaultValue={editingEntry?.note} placeholder={entryType === "advance" ? "سبب أو تفاصيل السلفة" : "طريقة أو مرجع السداد"} /></label>
      </div><button className="primary submit">{editingEntry ? "حفظ التعديلات" : entryType === "advance" ? "إضافة السلفة" : "تسجيل رد السلفة"}</button></form></Modal>}
    </div>
  );
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && close()}><div className="modal"><div className="modal-head"><h2>{title}</h2><button type="button" onClick={close}>×</button></div>{children}</div></div>;
}
