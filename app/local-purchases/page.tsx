"use client";

import Link from "next/link";
import { FormEvent, Fragment, useEffect, useRef, useState } from "react";
import { money, today, uid } from "@/lib/calc";
import {
  LOCAL_PURCHASES_STORAGE_KEY,
  LocalPurchaseCurrency,
  LocalPurchaseEntry,
  LocalPurchasesData,
  emptyLocalPurchasesData,
  normalizeLocalPurchasesData,
} from "@/lib/local-purchases";

type Modal = "currency" | "entry" | null;
const number = (value: number) => new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 4, numberingSystem: "latn" }).format(value);
const normalizeSearch = (value: string) => value
  .toLocaleLowerCase("ar")
  .replace(/[\u064B-\u065F\u0670ـ]/g, "")
  .replace(/[أإآ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/ة/g, "ه")
  .trim();

export default function LocalPurchasesPage() {
  const [data, setData] = useState<LocalPurchasesData>(emptyLocalPurchasesData);
  const [ready, setReady] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [editingCurrency, setEditingCurrency] = useState<LocalPurchaseCurrency | null>(null);
  const [editingEntry, setEditingEntry] = useState<LocalPurchaseEntry | null>(null);
  const [currencyId, setCurrencyId] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("all");
  const [search, setSearch] = useState("");
  const reportRef = useRef<HTMLElement>(null);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [selectedArchiveId, setSelectedArchiveId] = useState("");
  const [archiveFrom, setArchiveFrom] = useState("");
  const [archiveTo, setArchiveTo] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_PURCHASES_STORAGE_KEY);
      setData(stored ? normalizeLocalPurchasesData(JSON.parse(stored)) : emptyLocalPurchasesData());
    } catch {
      setData(emptyLocalPurchasesData());
    } finally {
      setReady(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (ready) localStorage.setItem(LOCAL_PURCHASES_STORAGE_KEY, JSON.stringify(data));
  }, [data, ready]);

  const selectedArchive = data.archives.find((archive) => archive.id === selectedArchiveId) || null;
  const displayCurrencies = selectedArchive?.currencies || data.currencies;
  const displayEntries = selectedArchive?.entries || data.entries;
  const sortedEntries = [...displayEntries].sort((a, b) => b.date.localeCompare(a.date));
  const visibleEntries = (() => {
    const query = normalizeSearch(search);
    return sortedEntries.filter((entry) =>
      (filterCurrency === "all" || entry.currencyId === filterCurrency) &&
      (!query || normalizeSearch([
        entry.description,
        entry.date,
        entry.type === "withdrawal" ? "سحب" : "إضافة توريد",
        entry.currencyName,
        String(entry.amount),
        String(entry.rate),
      ].join(" ")).includes(query)),
    );
  })();
  const signedValue = (entry: LocalPurchaseEntry) => entry.type === "withdrawal" ? -entry.voucherValue : entry.voucherValue;
  const signedAmount = (entry: LocalPurchaseEntry) => entry.type === "withdrawal" ? -entry.amount : entry.amount;
  const totalVoucher = visibleEntries.reduce((sum, entry) => sum + signedValue(entry), 0);
  const currencyTotals = displayCurrencies.map((currency) => ({
    ...currency,
    total: visibleEntries.filter((entry) => entry.currencyId === currency.id).reduce((sum, entry) => sum + signedAmount(entry), 0),
  }));
  const currencyMovementTotals = displayCurrencies.map((currency) => ({
    ...currency,
    additions: visibleEntries.filter((entry) => entry.currencyId === currency.id && entry.type === "addition").reduce((sum, entry) => sum + entry.amount, 0),
    withdrawals: visibleEntries.filter((entry) => entry.currencyId === currency.id && entry.type === "withdrawal").reduce((sum, entry) => sum + entry.amount, 0),
  })).filter((currency) => currency.additions > 0 || currency.withdrawals > 0);
  const calculatedVoucher = (Number(amount) || 0) * (Number(rate) || 0);

  function saveCurrency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const nextRate = Number(form.get("rate"));
    if (!name || nextRate <= 0) return;
    setData((current) => ({
      ...current,
      currencies: editingCurrency
        ? current.currencies.map((currency) => currency.id === editingCurrency.id ? { ...currency, name, rate: nextRate } : currency)
        : [...current.currencies, { id: uid(), name, rate: nextRate }],
    }));
    setEditingCurrency(null);
    setModal(null);
  }

  function openEntry(entry?: LocalPurchaseEntry) {
    if (!data.currencies.length) {
      alert("أضف عملة ومعاملها أولًا قبل تسجيل حركة.");
      return;
    }
    const selectedId = entry?.currencyId || data.currencies[0].id;
    const selectedCurrency = data.currencies.find((currency) => currency.id === selectedId);
    setEditingEntry(entry || null);
    setCurrencyId(selectedId);
    setAmount(entry ? String(entry.amount) : "");
    setRate(String(entry?.rate ?? selectedCurrency?.rate ?? ""));
    setModal("entry");
  }

  function changeCurrency(id: string) {
    setCurrencyId(id);
    setRate(String(data.currencies.find((currency) => currency.id === id)?.rate || ""));
  }

  function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currency = data.currencies.find((item) => item.id === currencyId);
    const entryAmount = Number(amount);
    const entryRate = Number(rate);
    const date = String(form.get("date") || "");
    const description = String(form.get("description") || "").trim();
    const type = String(form.get("type")) === "withdrawal" ? "withdrawal" : "addition";
    if (!currency || !date || !description || entryAmount <= 0 || entryRate <= 0) return;
    const entry: LocalPurchaseEntry = {
      id: editingEntry?.id || uid(), date, description, type,
      currencyId: currency.id, currencyName: currency.name,
      amount: entryAmount, rate: entryRate, voucherValue: entryAmount * entryRate,
    };
    setData((current) => ({
      ...current,
      entries: editingEntry ? current.entries.map((item) => item.id === editingEntry.id ? entry : item) : [...current.entries, entry],
    }));
    setEditingEntry(null);
    setModal(null);
  }

  function deleteCurrency(currency: LocalPurchaseCurrency) {
    if (data.entries.some((entry) => entry.currencyId === currency.id)) {
      alert("لا يمكن حذف عملة مرتبطة بحركات مسجلة. يمكنك تعديل اسمها أو معاملها.");
      return;
    }
    if (confirm(`حذف عملة «${currency.name}»؟`)) setData((current) => ({ ...current, currencies: current.currencies.filter((item) => item.id !== currency.id) }));
  }

  function deleteEntry(entry: LocalPurchaseEntry) {
    if (confirm(`حذف حركة «${entry.description}» بمبلغ ${number(entry.amount)} ${entry.currencyName}؟`)) {
      setData((current) => ({ ...current, entries: current.entries.filter((item) => item.id !== entry.id) }));
    }
  }

  function createNewStatement() {
    if (!data.entries.length) {
      alert("الكشف الحالي فارغ ولا توجد حركات لحفظها في الأرشيف.");
      return;
    }
    if (!confirm("سيتم حفظ الكشف الحالي كاملًا في الأرشيف وبدء كشف جديد فارغ مع الاحتفاظ بالعملات ومعاملاتها. هل تريد المتابعة؟")) return;
    setData((current) => ({
      ...current,
      entries: [],
      archives: [...current.archives, {
        id: uid(),
        archivedAt: new Date().toISOString(),
        currencies: current.currencies.map((currency) => ({ ...currency })),
        entries: current.entries.map((entry) => ({ ...entry })),
      }],
    }));
    setSelectedArchiveId("");
    setFilterCurrency("all");
    setSearch("");
  }

  function openArchive(id: string) {
    setSelectedArchiveId(id);
    setFilterCurrency("all");
    setSearch("");
    setArchiveOpen(false);
  }

  async function copyReportAsImage() {
    if (!reportRef.current) return;
    const report = reportRef.current;
    setCopying(true);
    report.classList.add("capturing-local-purchase-report");
    try {
      const { toBlob } = await import("html-to-image");
      const width = Math.max(report.scrollWidth, report.clientWidth);
      const height = Math.max(report.scrollHeight, report.clientHeight);
      const blob = await toBlob(report, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        width,
        height,
        filter: (node) => !(node instanceof HTMLElement && node.classList.contains("capture-hide")),
      });
      if (!blob) throw new Error("capture");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      alert("تعذر نسخ البيان. تأكد من السماح للموقع باستخدام الحافظة ثم حاول مرة أخرى.");
    } finally {
      report.classList.remove("capturing-local-purchase-report");
      setCopying(false);
    }
  }

  if (!ready) return <main className="loading">جارٍ تجهيز الشراء المحلي…</main>;

  return <div className="app local-purchases" dir="rtl">
    <aside className="sidebar print-hide">
      <div className="brand"><div><strong>شراء محلي</strong><small>Local Purchases</small></div></div>
      <nav>
        <button className="active"><span>▤</span> الحركات</button>
        <button onClick={() => { setEditingCurrency(null); setModal("currency"); }}><span>¤</span> إضافة عملة</button>
      </nav>
      <div className="side-actions">
        <Link href="/suppliers" className="side-link">→ حسابات الموردين</Link>
        <Link href="/" className="side-link">← كل الخدمات</Link>
        <small>البيانات محفوظة على هذا الجهاز</small>
      </div>
    </aside>

    <main className="main">
      <header className="topbar print-hide"><div><h1>شراء محلي</h1><p>{selectedArchive ? `عرض كشف محفوظ في الأرشيف — ${statementPeriod(selectedArchive.entries)}` : "بيان إضافة وسحب العملات وحساب قيمة الإذن بالجنيه تلقائيًا"}</p></div><div className="header-actions">{selectedArchive ? <button className="primary" onClick={() => { setSelectedArchiveId(""); setFilterCurrency("all"); setSearch(""); }}>العودة للكشف الحالي</button> : <><button className="secondary" onClick={createNewStatement}>＋ إنشاء كشف جديد</button>{data.archives.length > 0 && <button className="secondary" onClick={() => setArchiveOpen(true)}>أرشيف ({data.archives.length})</button>}<button className="secondary" onClick={() => { setEditingCurrency(null); setModal("currency"); }}>＋ عملة جديدة</button><button className="primary" onClick={() => openEntry()}>＋ حركة جديدة</button></>}</div></header>

      <section className="stats local-purchase-stats">
        <article><span className="stat-icon blue">¤</span><div><small>عدد العملات</small><b>{displayCurrencies.length}</b></div></article>
        <article><span className="stat-icon green">▤</span><div><small>الحركات المعروضة</small><b>{visibleEntries.length}</b></div></article>
        <article className="currency-balance-stat"><span className="stat-icon gold">¤</span><div><small>مبالغ التوريد والسحب</small><div className="currency-balance-values">{currencyMovementTotals.length ? currencyMovementTotals.map((currency) => <b key={currency.id}><strong>{currency.name}</strong>{currency.additions > 0 && <span className="movement-addition">توريد {number(currency.additions)}</span>}{currency.withdrawals > 0 && <span className="movement-withdrawal">سحب {number(currency.withdrawals)}</span>}</b>) : <b>لا توجد حركات</b>}</div></div></article>
      </section>

      {!selectedArchive && <section className="panel print-hide">
        <div className="panel-head"><div><h2>العملات والمعاملات</h2><p>تعديل المعامل يطبق على الحركات الجديدة فقط</p></div></div>
        <div className="currency-chip-list">
          {data.currencies.map((currency) => <article key={currency.id}><div><b>{currency.name}</b><small>المعامل: {number(currency.rate)}</small></div><div><button className="text-btn" onClick={() => { setEditingCurrency(currency); setModal("currency"); }}>تعديل</button><button className="danger-link" onClick={() => deleteCurrency(currency)}>حذف</button></div></article>)}
          {!data.currencies.length && <div className="empty">لم تتم إضافة عملات بعد.</div>}
        </div>
      </section>}

      <section ref={reportRef} className="panel local-purchase-report">
        <div className="panel-head"><div><h2>{selectedArchive ? `بيان الشراء المحلي — كشف ${data.archives.findIndex((archive) => archive.id === selectedArchive.id) + 1}` : "بيان الشراء المحلي"}</h2></div><div className="local-purchase-filters capture-hide"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث في كل البيانات" /><select value={filterCurrency} onChange={(event) => setFilterCurrency(event.target.value)}><option value="all">كل العملات</option>{displayCurrencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name}</option>)}</select><button className="secondary" disabled={copying} onClick={copyReportAsImage}>{copying ? "جارٍ تجهيز الصورة…" : copied ? "✓ تم نسخ البيان" : "▣ نسخ البيان كصورة"}</button></div></div>
        <div className="table-wrap"><table className="excel-like-table"><thead><tr><th rowSpan={2} className="purchase-description-col">البيان</th><th rowSpan={2} className="purchase-date-col">التاريخ</th><th rowSpan={2} className="purchase-type-col">الحركة</th>{displayCurrencies.map((currency) => <th key={currency.id} colSpan={2} className="currency-group">{currency.name}</th>)}<th rowSpan={2} className="purchase-voucher-col">قيمة الإذن (ج.م)</th>{!selectedArchive && <th rowSpan={2} className="purchase-actions-col capture-hide">إجراءات</th>}</tr><tr>{displayCurrencies.map((currency) => <Fragment key={currency.id}><th className="currency-amount-col">المبلغ</th><th className="currency-rate-col">المعامل</th></Fragment>)}</tr></thead><tbody>
          {visibleEntries.map((entry) => <tr key={entry.id} className={entry.type === "withdrawal" ? "row-withdrawal" : "row-deposit"}><td className="purchase-description-col"><b>{entry.description}</b></td><td className="purchase-date-col">{entry.date}</td><td className="purchase-type-col"><span className={`badge ${entry.type === "withdrawal" ? "late" : "ok"}`}>{entry.type === "withdrawal" ? "سحب" : "إضافة"}</span></td>{displayCurrencies.map((currency) => <Fragment key={currency.id}><td className="currency-amount-col">{entry.currencyId === currency.id ? <b>{number(signedAmount(entry))}</b> : ""}</td><td className="currency-rate-col">{entry.currencyId === currency.id ? number(entry.rate) : ""}</td></Fragment>)}<td className="purchase-voucher-col voucher-secondary">{money(signedValue(entry))}</td>{!selectedArchive && <td className="purchase-actions-col capture-hide"><div className="payment-actions"><button className="edit-payment" onClick={() => openEntry(entry)}>تعديل</button><button className="delete-payment" onClick={() => deleteEntry(entry)}>حذف</button></div></td>}</tr>)}
          {!visibleEntries.length && <tr><td colSpan={4 + displayCurrencies.length * 2 + (selectedArchive ? 0 : 1)} className="empty">لا توجد حركات مطابقة.</td></tr>}
        </tbody><tfoot><tr className="total-row"><td colSpan={3}>الإجماليات</td>{currencyTotals.map((currency) => <Fragment key={currency.id}><td className="currency-amount-col currency-grand-total"><span>{number(currency.total)}</span><small>{currency.name}</small></td><td className="currency-rate-col">—</td></Fragment>)}<td className="purchase-voucher-col">{money(totalVoucher)}</td>{!selectedArchive && <td className="purchase-actions-col capture-hide" />}</tr></tfoot></table></div>
      </section>
    </main>

    {modal === "currency" && <Dialog title={editingCurrency ? "تعديل العملة" : "إضافة عملة"} close={() => setModal(null)}><form className="form" onSubmit={saveCurrency}><div className="form-grid"><label>اسم العملة<input name="name" required autoFocus defaultValue={editingCurrency?.name} placeholder="مثال: ريال" /></label><label>المعامل<input name="rate" type="number" min="0.0001" step="0.0001" required defaultValue={editingCurrency?.rate} placeholder="مثال: 13.08" /></label></div><button className="primary submit">حفظ العملة</button></form></Dialog>}
    {modal === "entry" && <Dialog title={editingEntry ? "تعديل الحركة" : "إضافة حركة شراء محلي"} close={() => setModal(null)}><form className="form" onSubmit={saveEntry}><div className="form-grid"><label>التاريخ<input name="date" type="date" required defaultValue={editingEntry?.date || today()} /></label><label>نوع الحركة<select name="type" defaultValue={editingEntry?.type || "addition"}><option value="addition">إضافة عملة</option><option value="withdrawal">سحب عملة</option></select></label><label className="wide">البيان<input name="description" required autoFocus defaultValue={editingEntry?.description} placeholder="اكتب بيان الحركة" /></label><label>العملة<select value={currencyId} onChange={(event) => changeCurrency(event.target.value)} required>{data.currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name}</option>)}</select></label><label>مبلغ العملة<input type="number" min="0.0001" step="0.0001" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label>المعامل<input type="number" min="0.0001" step="0.0001" required value={rate} onChange={(event) => setRate(event.target.value)} /></label><div className="balance-box"><small>قيمة الإذن بالجنيه</small><b>{money(calculatedVoucher)}</b></div></div><button className="primary submit">{editingEntry ? "حفظ التعديلات" : "تسجيل الحركة"}</button></form></Dialog>}
    {archiveOpen && <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setArchiveOpen(false)}><div className="modal archive-modal"><div className="modal-head"><div><h2>أرشيف كشوف الشراء المحلي</h2><p>اختر الفترة ثم افتح الكشف المطلوب.</p></div><button type="button" onClick={() => setArchiveOpen(false)}>×</button></div><div className="statement-archive-browser"><div className="archive-date-filter"><label>من تاريخ<input type="date" value={archiveFrom} onChange={(event) => setArchiveFrom(event.target.value)} /></label><label>إلى تاريخ<input type="date" value={archiveTo} onChange={(event) => setArchiveTo(event.target.value)} /></label>{(archiveFrom || archiveTo) && <button className="secondary" onClick={() => { setArchiveFrom(""); setArchiveTo(""); }}>مسح الفترة</button>}</div><div className="archive-results">{data.archives.map((archive, index) => { const period = archivePeriod(archive.entries); const matches = (!archiveFrom || period.end >= archiveFrom) && (!archiveTo || period.start <= archiveTo); return matches ? <button key={archive.id} onClick={() => openArchive(archive.id)}><b>كشف {index + 1}</b><span>{period.start} ← {period.end}</span></button> : null; })}</div></div></div></div>}
  </div>;
}

function archivePeriod(entries: LocalPurchaseEntry[]) {
  const dates = entries.map((entry) => entry.date).sort();
  const fallback = today();
  return { start: dates[0] || fallback, end: dates[dates.length - 1] || fallback };
}

function statementPeriod(entries: LocalPurchaseEntry[]) {
  const period = archivePeriod(entries);
  return `${period.start} ← ${period.end}`;
}

function Dialog({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && close()}><div className="modal"><div className="modal-head"><h2>{title}</h2><button type="button" onClick={close}>×</button></div>{children}</div></div>;
}
