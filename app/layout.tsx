import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "حسابات خاصة — مجموعة شركات آثار للسياحة",
  description: "نظام متابعة حسابات العملاء الخاصة وعوائدها الشهرية ومسحوباتهم",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
