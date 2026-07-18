"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

const services = [
  { href: "/clients", icon: "▤", title: "حسابات خاصة" },
  { href: "/suppliers", icon: "◫", title: "حسابات الموردين" },
];

type StickyNote = {
  id: string;
  text: string;
};

const NOTES_STORAGE_KEY = "athar-home-sticky-notes-v1";
const CLIENTS_STORAGE_KEY = "athar-private-accounts-clients-v1";
const RATES_STORAGE_KEY = "athar-private-accounts-rates-v1";
const SUPPLIERS_STORAGE_KEY = "athar-suppliers-accounts-suppliers-v1";

export default function Home() {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const storedNotes = localStorage.getItem(NOTES_STORAGE_KEY);
        if (storedNotes) setNotes(JSON.parse(storedNotes) as StickyNote[]);
      } catch {
        localStorage.removeItem(NOTES_STORAGE_KEY);
      } finally {
        setNotesLoaded(true);
      }
    });
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
      { id: crypto.randomUUID(), text },
      ...currentNotes,
    ]);
    setNoteText("");
  };

  const deleteNote = (id: string) => {
    setNotes((currentNotes) => currentNotes.filter((note) => note.id !== id));
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
        Array.isArray(data.notes);

      if (!isValid || !data) {
        alert("ملف غير صالح — اختر نسخة احتياطية كاملة لنظام الحسابات.");
        return;
      }
      if (
        !confirm(
          "سيتم استبدال كل بيانات النظام الحالية: الحسابات الخاصة، الموردين، معدلات العائد، والملاحظات. هل تريد المتابعة؟",
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
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(data.notes));
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

      <section className="system-backup" aria-labelledby="system-backup-title">
        <div>
          <h2 id="system-backup-title">بيانات النظام</h2>
          <p>نسخة واحدة تشمل الحسابات الخاصة والموردين والملاحظات.</p>
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

      <section className="sticky-board" aria-labelledby="sticky-notes-title">
        <div className="sticky-board-head">
          <div>
            <h2 id="sticky-notes-title">ملاحظات تذكيرية</h2>
            <p>اكتب المهام التي تريد تذكّرها واحذفها بعد الانتهاء.</p>
          </div>
          <span className="notes-count">{notes.length} ملاحظة</span>
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

        {notesLoaded && notes.length === 0 ? (
          <p className="sticky-empty">لا توجد ملاحظات حالياً.</p>
        ) : (
          <div className="sticky-notes" aria-live="polite">
            {notes.map((note, index) => (
              <article
                className={`sticky-note sticky-note-${index % 3}`}
                key={note.id}
              >
                <span className="sticky-tape" aria-hidden="true" />
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
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
