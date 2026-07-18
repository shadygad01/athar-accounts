import Link from "next/link";

const services = [
  {
    href: "/clients",
    icon: "▤",
    title: "حسابات خاصة",
    desc: "متابعة حسابات العملاء الخاصة، دفعاتهم، عوائدهم الشهرية، ومسحوباتهم من الأصل أو الفوائد.",
  },
  {
    href: "/suppliers",
    icon: "◫",
    title: "حسابات الموردين",
    desc: "متابعة توريدات الموردين بالدرهم الإماراتي أو الريال السعودي، ومعامل الصرف المتفق عليه لكل معاملة، وسدادها بالجنيه المصري على دفعات.",
  },
];

export default function Home() {
  return (
    <div className="landing" dir="rtl">
      <header className="landing-head">
        <div>
          <h1>نظام الحسابات</h1>
          <p>اختر الخدمة التي تريد العمل عليها</p>
        </div>
      </header>
      <div className="service-grid">
        {services.map((s) => (
          <Link href={s.href} key={s.href} className="service-card">
            <span className="service-icon">{s.icon}</span>
            <h2>{s.title}</h2>
            <p>{s.desc}</p>
            <strong className="arrow">←</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
