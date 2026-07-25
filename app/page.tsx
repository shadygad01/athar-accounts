"use client";

import Link from "next/link";
import {
  ChangeEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  REMINDERS_STORAGE_KEY,
  Reminder,
  formatReminderDate,
  isVisibleOnHome,
  occurrenceForReminder,
  reminderDaysAway,
} from "@/lib/reminders";
import {
  RECEIVABLES_STORAGE_KEY,
  ReceivableAccount,
  buildReceivableLedger,
  receivableDaysAway,
} from "@/lib/receivables";
import { LOCAL_PURCHASES_STORAGE_KEY } from "@/lib/local-purchases";

const services = [
  { href: "/clients", icon: "▤", title: "حسابات خاصة" },
  { href: "/suppliers", icon: "◫", title: "حسابات الموردين" },
  { href: "/different-accounts", icon: "◒", title: "حسابات مختلفة" },
  { href: "/local-purchases", icon: "▤", title: "شراء محلي" },
];

type StickyNote = {
  id: string;
  text: string;
  createdAt?: string;
  x?: number;
  y?: number;
  z?: number;
  rotation?: number;
};

const NOTES_STORAGE_KEY = "athar-home-sticky-notes-v1";
const CLIENTS_STORAGE_KEY = "athar-private-accounts-clients-v1";
const RATES_STORAGE_KEY = "athar-private-accounts-rates-v1";
const SUPPLIERS_STORAGE_KEY = "athar-suppliers-accounts-suppliers-v1";
const PAYABLES_STORAGE_KEY = "athar-accounts-payable-v1";
type ExchangeRate = { code: string; name: string; value: number };

const storedNoteRotation = (note: StickyNote) => {
  if (typeof note.rotation === "number") return note.rotation;
  const hash = [...note.id].reduce(
    (value, character) => value + character.charCodeAt(0),
    0,
  );
  return ((hash % 37) - 18) / 10;
};

const normalizeNoteLayers = (notes: StickyNote[]) =>
  [...notes]
    .sort((first, second) => (first.z ?? 0) - (second.z ?? 0))
    .map((note, index) => ({ ...note, z: 100 + index }));

export default function Home() {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [lastDeletedNote, setLastDeletedNote] = useState<StickyNote | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [receivables, setReceivables] = useState<ReceivableAccount[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState("");
  const [ratesError, setRatesError] = useState(false);
  const restoreFileRef = useRef<HTMLInputElement>(null);
  const draggingNote = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const storedNotes = localStorage.getItem(NOTES_STORAGE_KEY);
        if (storedNotes) {
          setNotes(
            normalizeNoteLayers(JSON.parse(storedNotes) as StickyNote[]),
          );
        }
        const storedReminders = localStorage.getItem(REMINDERS_STORAGE_KEY);
        if (storedReminders) setReminders(JSON.parse(storedReminders) as Reminder[]);
        const storedReceivables = localStorage.getItem(RECEIVABLES_STORAGE_KEY);
        if (storedReceivables) setReceivables(JSON.parse(storedReceivables) as ReceivableAccount[]);
      } catch {
        localStorage.removeItem(NOTES_STORAGE_KEY);
      } finally {
        setNotesLoaded(true);
      }
    });
  }, []);

  useEffect(() => {
    let active = true;
    let lastRatesLoad = 0;
    const loadRates = async () => {
      lastRatesLoad = Date.now();
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/exchange-rates?v=${Date.now()}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("rates");
        const data = await response.json() as { rates: ExchangeRate[]; updatedAt: string };
        if (active) {
          setExchangeRates(data.rates);
          setRatesUpdatedAt(data.updatedAt);
          setRatesError(false);
        }
      } catch {
        if (active) setRatesError(true);
      }
    };
    const refreshRatesWhenVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRatesLoad >= 2 * 60 * 60 * 1000
      ) {
        void loadRates();
      }
    };
    void loadRates();
    const timer = window.setInterval(loadRates, 2 * 60 * 60 * 1000);
    document.addEventListener("visibilitychange", refreshRatesWhenVisible);
    window.addEventListener("focus", refreshRatesWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshRatesWhenVisible);
      window.removeEventListener("focus", refreshRatesWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (notesLoaded) {
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
    }
  }, [notes, notesLoaded]);

  const addNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = noteText.trim();
    if (!text) return;

    setNotes((currentNotes) => [
      {
        id: crypto.randomUUID(),
        text,
        createdAt: new Date().toISOString(),
        x: 24 + (currentNotes.length % 4) * 34,
        y: Math.max(16, 150 + (currentNotes.length % 4) * 28),
        z: 100 + currentNotes.length,
        rotation: Number((Math.random() * 3.6 - 1.8).toFixed(1)),
      },
      ...currentNotes,
    ]);
    setNoteText("");
  };

  const deleteNote = (id: string) => {
    setNotes((currentNotes) => {
      const deletedNote = currentNotes.find((note) => note.id === id);
      if (!deletedNote) return currentNotes;
      setLastDeletedNote(deletedNote);
      return currentNotes.filter((note) => note.id !== id);
    });
  };

  const restoreLastDeletedNote = () => {
    if (!lastDeletedNote) return;
    setNotes((currentNotes) => {
      if (currentNotes.some((note) => note.id === lastDeletedNote.id)) {
        return currentNotes;
      }
      return [
        ...normalizeNoteLayers(currentNotes),
        { ...lastDeletedNote, z: 100 + currentNotes.length },
      ];
    });
    setLastDeletedNote(null);
  };

  const bringNoteToFront = (id: string) => {
    setNotes((currentNotes) => {
      const selectedNote = currentNotes.find((note) => note.id === id);
      if (!selectedNote) return currentNotes;
      const otherNotes = normalizeNoteLayers(
        currentNotes.filter((note) => note.id !== id),
      );
      return [
        ...otherNotes,
        { ...selectedNote, z: 100 + otherNotes.length },
      ];
    });
  };

  const startDraggingNote = (
    event: ReactPointerEvent<HTMLSpanElement>,
    note: StickyNote,
  ) => {
    if (!event.isPrimary || event.button !== 0) return;
    const noteElement = event.currentTarget.closest(
      ".sticky-note",
    ) as HTMLElement | null;
    if (!noteElement) return;
    const rect = noteElement.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingNote.current = {
      id: note.id,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    bringNoteToFront(note.id);
  };

  const moveDraggingNote = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = draggingNote.current;
    if (!drag) return;
    if ((event.buttons & 1) === 0) {
      draggingNote.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const noteWidth = Math.min(270, window.innerWidth - 24);
    const noteHeight = 190;
    const x = Math.min(
      Math.max(12, event.clientX - drag.offsetX),
      Math.max(12, window.innerWidth - noteWidth - 12),
    );
    const y = Math.min(
      Math.max(12, event.clientY - drag.offsetY),
      Math.max(12, window.innerHeight - noteHeight - 12),
    );
    setNotes((currentNotes) =>
      currentNotes.map((note) =>
        note.id === drag.id ? { ...note, x, y } : note,
      ),
    );
  };

  const stopDraggingNote = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggingNote.current = null;
  };

  const backupSystem = () => {
    const readArray = (key: string) => {
      try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : [];
      } catch {
        return [];
      }
    };
    const backup = {
      type: "athar-accounts-full-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        clients: readArray(CLIENTS_STORAGE_KEY),
        rates: readArray(RATES_STORAGE_KEY),
        suppliers: readArray(SUPPLIERS_STORAGE_KEY),
        payables: readArray(PAYABLES_STORAGE_KEY),
        localPurchases: (() => {
          try {
            const value = localStorage.getItem(LOCAL_PURCHASES_STORAGE_KEY);
            return value ? JSON.parse(value) : { currencies: [], entries: [] };
          } catch {
            return { currencies: [], entries: [] };
          }
        })(),
        receivables: readArray(RECEIVABLES_STORAGE_KEY),
        reminders: readArray(REMINDERS_STORAGE_KEY),
        notes: readArray(NOTES_STORAGE_KEY),
      },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `نسخة-احتياطية-كاملة-نظام-الحسابات-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const restoreSystem = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const backup = JSON.parse(await file.text()) as {
        type?: string;
        data?: Record<string, unknown>;
      };
      const data = backup.data;
      const isValid =
        backup.type === "athar-accounts-full-backup" &&
        data &&
        Array.isArray(data.clients) &&
        Array.isArray(data.rates) &&
        Array.isArray(data.suppliers) &&
        (data.payables === undefined || Array.isArray(data.payables)) &&
        (data.localPurchases === undefined || (typeof data.localPurchases === "object" && data.localPurchases !== null)) &&
        (data.receivables === undefined || Array.isArray(data.receivables)) &&
        (data.reminders === undefined || Array.isArray(data.reminders)) &&
        Array.isArray(data.notes);

      if (!isValid || !data) {
        alert("ملف غير صالح — اختر نسخة احتياطية كاملة لنظام الحسابات.");
        return;
      }
      if (
        !confirm(
          "سيتم استبدال كل بيانات النظام الحالية: الحسابات الخاصة، الموردين، الحسابات المدينة والدائنة، التنبيهات، معدلات العائد، والملاحظات. هل تريد المتابعة؟",
        )
      ) {
        return;
      }

      localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(data.clients));
      localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(data.rates));
      localStorage.setItem(
        SUPPLIERS_STORAGE_KEY,
        JSON.stringify(data.suppliers),
      );
      localStorage.setItem(PAYABLES_STORAGE_KEY, JSON.stringify(data.payables || []));
      localStorage.setItem(LOCAL_PURCHASES_STORAGE_KEY, JSON.stringify(data.localPurchases || { currencies: [], entries: [] }));
      localStorage.setItem(RECEIVABLES_STORAGE_KEY, JSON.stringify(data.receivables || []));
      localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(data.reminders || []));
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(data.notes));
      setReminders((data.reminders || []) as Reminder[]);
      setReceivables((data.receivables || []) as ReceivableAccount[]);
      setNotes(data.notes as StickyNote[]);
      alert("تمت استعادة بيانات النظام كاملة بنجاح.");
    } catch {
      alert("تعذر قراءة الملف — تأكد أنه ملف نسخة احتياطية صحيحة.");
    }
  };

  return (
    <div className="landing" dir="rtl">
      <header className="landing-head">
        <div>
          <h1>نظام الحسابات</h1>
          <p>اختر الخدمة التي تريد العمل عليها</p>
        </div>
      </header>

      <div className="service-grid">
        {services.map((service) => (
          <Link
            href={service.href}
            key={service.href}
            className="service-card"
          >
            <span className="service-icon">{service.icon}</span>
            <h2>{service.title}</h2>
            <strong className="arrow">←</strong>
          </Link>
        ))}
      </div>

      <section className="home-dashboard-row">
        <div className="currency-widget" aria-live="polite">
          <div className="currency-widget-head">
            <div><h2>أسعار العملات اليوم</h2><p>قيمة العملة مقابل الجنيه المصري</p></div>
            <span>ج.م</span>
          </div>
          {exchangeRates.length > 0 ? (
            <div className="currency-rates">
              {exchangeRates.map((rate) => (
                <div key={rate.code}>
                  <span className="currency-code">{rate.code}</span>
                  <small>{rate.name}</small>
                  <b>{rate.value.toLocaleString("ar-EG-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className={`currency-status ${ratesError ? "error" : ""}`}>
              {ratesError ? "تعذر تحديث الأسعار الآن." : "جارٍ تحديث الأسعار…"}
            </p>
          )}
          {ratesUpdatedAt && <time>آخر تحديث {new Date(ratesUpdatedAt).toLocaleTimeString("ar-EG-u-nu-latn", { hour: "2-digit", minute: "2-digit" })}</time>}
        </div>

        <div className="home-reminders">
          <div className="home-reminders-head">
            <div><h2>تنبيهات قريبة</h2><p>الالتزامات المستحقة خلال يومين</p></div>
            <Link href="/reminders">إدارة التنبيهات</Link>
          </div>
          <div className="home-reminders-list">
            {receivables.filter((account) => buildReceivableLedger(account).balance > 0 && receivableDaysAway(account.dueDate) <= 2).map((account) => {
              const days = receivableDaysAway(account.dueDate);
              return (
                <Link href="/receivables" key={`receivable-${account.id}`}>
                  <span className={days < 0 ? "overdue" : ""}>!</span>
                  <div><b>موعد رد سلفة: {account.name}</b><small>{formatReminderDate(account.dueDate)}</small></div>
                  <em>{days < 0 ? "متأخر" : days === 0 ? "اليوم" : days === 1 ? "غدًا" : "بعد يومين"}</em>
                </Link>
              );
            })}
            {reminders.filter((item) => isVisibleOnHome(item)).map((item) => {
              const days = reminderDaysAway(item);
              return (
                <Link href="/reminders" key={item.id}>
                  <span className={days < 0 ? "overdue" : ""}>!</span>
                  <div><b>{item.text}</b><small>{formatReminderDate(occurrenceForReminder(item))}</small></div>
                  <em>{days < 0 ? "متأخر" : days === 0 ? "اليوم" : days === 1 ? "غدًا" : "بعد يومين"}</em>
                </Link>
              );
            })}
            {!reminders.some((item) => isVisibleOnHome(item)) && !receivables.some((account) => buildReceivableLedger(account).balance > 0 && receivableDaysAway(account.dueDate) <= 2) && <p className="home-reminders-empty">لا توجد التزامات قريبة.</p>}
          </div>
        </div>
      </section>

      <section className="sticky-reminders-row" aria-labelledby="sticky-notes-title">
        <div className="sticky-board-head">
          <div>
            <h2 id="sticky-notes-title">ملاحظات تذكيرية</h2>
            <p>اكتب المهام التي تريد تذكّرها واحذفها بعد الانتهاء.</p>
          </div>
          <div className="sticky-board-actions">
            {lastDeletedNote && (
              <button type="button" className="restore-note" onClick={restoreLastDeletedNote}>
                ↶ استرجاع آخر ملاحظة
              </button>
            )}
            <span className="notes-count">{notes.length} ملاحظة</span>
          </div>
        </div>

        <form className="sticky-form" onSubmit={addNote}>
          <label htmlFor="sticky-note-text">ملاحظة جديدة</label>
          <div className="sticky-form-row">
            <textarea
              id="sticky-note-text"
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="مثال: مراجعة حساب المورد غداً"
              rows={2}
              maxLength={240}
            />
            <button type="submit" disabled={!noteText.trim()}>
              إضافة ملاحظة
            </button>
          </div>
        </form>

        {notesLoaded && notes.length === 0 && (
          <p className="sticky-empty">لا توجد ملاحظات حالياً.</p>
        )}

        <Link href="/reminders" className="reminders-service-card">
          <span className="service-icon">◔</span>
          <div>
            <h2>تنبيهات</h2>
            <p>إدارة مواعيد الالتزامات والتنبيهات المتكررة</p>
          </div>
          <strong className="arrow">←</strong>
        </Link>
      </section>

      <section className="system-backup" aria-labelledby="system-backup-title">
        <div>
          <h2 id="system-backup-title">بيانات النظام</h2>
          <p>نسخة واحدة تشمل الحسابات الخاصة والموردين والحسابات المدينة والدائنة والتنبيهات والملاحظات.</p>
        </div>
        <div className="system-backup-actions">
          <button type="button" onClick={backupSystem}>
            ↓ نسخ احتياطي كامل
          </button>
          <button
            type="button"
            className="restore"
            onClick={() => restoreFileRef.current?.click()}
          >
            ↑ استعادة بيانات النظام
          </button>
          <input
            ref={restoreFileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={restoreSystem}
          />
        </div>
      </section>

      <div className="sticky-notes" aria-live="polite">
        {notes.map((note, index) => (
          <article
            className="sticky-note"
            key={note.id}
            style={{
              left: note.x ?? 24 + (index % 4) * 34,
              top: note.y ?? 150 + (index % 5) * 34,
              zIndex: note.z ?? 100 + index,
              rotate: `${storedNoteRotation(note)}deg`,
            }}
            onPointerDown={() => bringNoteToFront(note.id)}
          >
            <span
              className="sticky-tape"
              role="button"
              tabIndex={0}
              aria-label={`تحريك الملاحظة: ${note.text}`}
              title="اسحب لتحريك الملاحظة"
              onPointerDown={(event) => startDraggingNote(event, note)}
              onPointerMove={moveDraggingNote}
              onPointerUp={stopDraggingNote}
              onPointerCancel={stopDraggingNote}
            />
            <button
              type="button"
              className="sticky-delete"
              onClick={() => deleteNote(note.id)}
              aria-label={`حذف الملاحظة: ${note.text}`}
              title="حذف الملاحظة"
            >
              ×
            </button>
            <p>{note.text}</p>
            <time
              className="sticky-date"
              dateTime={note.createdAt}
              title={note.createdAt ? "تاريخ تدوين الملاحظة" : undefined}
            >
              {note.createdAt
                ? new Intl.DateTimeFormat("ar-EG", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  }).format(new Date(note.createdAt))
                : "ملاحظة سابقة"}
            </time>
          </article>
        ))}
      </div>
    </div>
  );
}
