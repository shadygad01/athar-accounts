import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "نظام الحسابات — مجموعة شركات آثار للسياحة",
  description: "نظام حسابات يضم حسابات العملاء الخاصة وعوائدها الشهرية، وحسابات الموردين وتوريداتهم وسداداتهم",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
