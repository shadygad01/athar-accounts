"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  REMINDERS_STORAGE_KEY,
  Reminder,
  ReminderRecurrence,
  formatReminderDate,
  occurrenceForReminder,
} from "@/lib/reminders";

const todayValue = () => new Date().toISOString().slice(0, 10);

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  /* بيانات التنبيهات محلية، ولذلك تتم قراءتها مرة واحدة عند فتح الخدمة. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMINDERS_STORAGE_KEY);
      setReminders(saved ? JSON.parse(saved) : []);
    } catch {
      setReminders([]);
    } finally {
      setReady(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (ready) localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(reminders));
  }, [ready, reminders]);

  const sorted = useMemo(
    () =>
      [...reminders].sort((a, b) =>
        occurrenceForReminder(a).localeCompare(occurrenceForReminder(b)),
      ),
    [reminders],
  );

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function saveReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = String(data.get("text") || "").trim();
    const dueDate = String(data.get("dueDate") || "");
    const recurrence = String(data.get("recurrence")) as ReminderRecurrence;
    if (!text || !dueDate) return;

    const next: Reminder = {
      id: editing?.id || crypto.randomUUID(),
      text,
      dueDate,
      recurrence,
      createdAt: editing?.createdAt || new Date().toISOString(),
    };
    setReminders((current) =>
      editing
        ? current.map((item) => (item.id === editing.id ? next : item))
        : [...current, next],
    );
    setEditing(null);
    setModalOpen(false);
  }

  function remove(reminder: Reminder) {
    if (!confirm(`حذف التنبيه «${reminder.text}»؟`)) return;
    setReminders((current) => current.filter((item) => item.id !== reminder.id));
  }

  if (!ready) return <main className="loading">جارٍ تجهيز التنبيهات…</main>;

  return (
    <div className="app" dir="rtl">
      <aside className="sidebar">
        <div className="brand">
          <div><strong>التنبيهات</strong><small>متابعة الالتزامات ومواعيد الوفاء</small></div>
        </div>
        <nav>
          <button className="active"><span>◉</span> كل التنبيهات</button>
        </nav>
        <div className="side-actions">
          <Link href="/" className="side-link">← كل الخدمات</Link>
          <small>البيانات محفوظة على هذا الجهاز</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>التنبيهات</h1>
            <p>أنشئ مواعيد لمرة واحدة أو التزامات تتكرر شهريًا</p>
          </div>
          <button className="primary" onClick={openNew}>＋ تنبيه جديد</button>
        </header>

        <section className="content-stack reminders-stack">
          <div className="reminders-intro">
            يظهر التنبيه تلقائيًا في الصفحة الرئيسية قبل موعد الوفاء بيومين.
          </div>
          <div className="reminders-list">
            {sorted.map((reminder) => {
              const occurrence = occurrenceForReminder(reminder);
              return (
                <article className="reminder-card" key={reminder.id}>
                  <span className="reminder-bell">◔</span>
                  <div className="reminder-copy">
                    <h2>{reminder.text}</h2>
                    <p>
                      موعد الوفاء: <b>{formatReminderDate(occurrence)}</b>
                      {reminder.recurrence === "monthly" && occurrence !== reminder.dueDate
                        ? ` · التاريخ الأساسي ${formatReminderDate(reminder.dueDate)}`
                        : ""}
                    </p>
                  </div>
                  <span className={`reminder-kind ${reminder.recurrence}`}>
                    {reminder.recurrence === "monthly" ? "شهري" : "مرة واحدة"}
                  </span>
                  <div className="payment-actions">
                    <button className="edit-payment" onClick={() => { setEditing(reminder); setModalOpen(true); }}>تعديل</button>
                    <button className="delete-payment" onClick={() => remove(reminder)}>حذف</button>
                  </div>
                </article>
              );
            })}
            {!sorted.length && (
              <div className="empty-state">لا توجد تنبيهات بعد. اضغط «تنبيه جديد» لإضافة أول موعد.</div>
            )}
          </div>
        </section>
      </main>

      {modalOpen && (
        <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setModalOpen(false)}>
          <div className="modal">
            <div className="modal-head">
              <h2>{editing ? "تعديل التنبيه" : "إنشاء تنبيه جديد"}</h2>
              <button type="button" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <form className="form" onSubmit={saveReminder}>
              <div className="form-grid">
                <label className="wide">بيان التنبيه
                  <textarea name="text" rows={3} required autoFocus maxLength={300} defaultValue={editing?.text} placeholder="مثال: تجديد اشتراك الإنترنت للرقم 0123…" />
                </label>
                <label>تاريخ الوفاء
                  <input name="dueDate" type="date" required defaultValue={editing?.dueDate || todayValue()} />
                </label>
                <label>التكرار
                  <select name="recurrence" defaultValue={editing?.recurrence || "once"}>
                    <option value="once">مرة واحدة فقط</option>
                    <option value="monthly">متكرر كل شهر</option>
                  </select>
                </label>
              </div>
              <button className="primary submit">{editing ? "حفظ التعديلات" : "إضافة التنبيه"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
