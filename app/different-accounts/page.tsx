import Link from "next/link";

const options = [
  { href: "/receivables", icon: "↙", title: "حسابات مدينة", text: "السلفيات ودفعات رد السلفة ومواعيد السداد" },
  { href: "/payables", icon: "↗", title: "حسابات دائنة", text: "الالتزامات المستحقة ودفعات السداد الحالية" },
];

export default function DifferentAccountsPage() {
  return (
    <div className="landing different-accounts-page" dir="rtl">
      <header className="landing-head">
        <div><h1>حسابات مختلفة</h1><p>اختر نوع الحساب الذي تريد العمل عليه</p></div>
      </header>
      <div className="service-grid different-accounts-grid">
        {options.map((option) => (
          <Link href={option.href} className="service-card" key={option.href}>
            <span className="service-icon">{option.icon}</span>
            <h2>{option.title}</h2>
            <p className="service-description">{option.text}</p>
            <strong className="arrow">←</strong>
          </Link>
        ))}
      </div>
      <Link href="/" className="different-accounts-back">→ العودة إلى كل الخدمات</Link>
    </div>
  );
}
