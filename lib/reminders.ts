export const REMINDERS_STORAGE_KEY = "athar-reminders-v1";

export type ReminderRecurrence = "once" | "monthly";

export type Reminder = {
  id: string;
  text: string;
  dueDate: string;
  recurrence: ReminderRecurrence;
  createdAt: string;
};

const dateAtNoon = (value: string) => new Date(`${value}T12:00:00`);

export const formatReminderDate = (value: string) =>
  new Intl.DateTimeFormat("ar-EG-u-ca-gregory-nu-latn", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(dateAtNoon(value));

export function occurrenceForReminder(reminder: Reminder, reference = new Date()) {
  if (reminder.recurrence === "once") return reminder.dueDate;

  const original = dateAtNoon(reminder.dueDate);
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(original.getDate(), lastDay);
  const candidate = new Date(year, month, day, 12);

  if (candidate < new Date(year, month, reference.getDate(), 0)) {
    const nextLastDay = new Date(year, month + 2, 0).getDate();
    candidate.setMonth(month + 1, Math.min(original.getDate(), nextLastDay));
  }

  return [
    candidate.getFullYear(),
    String(candidate.getMonth() + 1).padStart(2, "0"),
    String(candidate.getDate()).padStart(2, "0"),
  ].join("-");
}

export function reminderDaysAway(reminder: Reminder, reference = new Date()) {
  const due = dateAtNoon(occurrenceForReminder(reminder, reference));
  const today = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    12,
  );
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function isVisibleOnHome(reminder: Reminder, reference = new Date()) {
  const days = reminderDaysAway(reminder, reference);
  return days <= 2 && (reminder.recurrence === "once" || days >= 0);
}
