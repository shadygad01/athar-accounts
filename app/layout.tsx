import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "حسابات خاصة — مجموعة شركات آثار للسياحة",
  description: "نظام متابعة حسابات العملاء الخاصة وعوائدها الشهرية ومسحوباتهم",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
