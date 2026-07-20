import { NextResponse } from "next/server";

export const revalidate = 7200;

const currencies = [
  { code: "USD", name: "الدولار الأمريكي" },
  { code: "AED", name: "الدرهم الإماراتي" },
  { code: "SAR", name: "الريال السعودي" },
] as const;

async function readRate(code: string) {
  const response = await fetch(`https://www.google.com/finance/quote/${code}-EGP`, {
    headers: {
      "Accept-Language": "en",
      "User-Agent": "Mozilla/5.0 (compatible; AtharAccounts/1.0)",
    },
    next: { revalidate: 7200 },
  });
  if (!response.ok) throw new Error(`Rate request failed: ${response.status}`);
  const html = await response.text();
  const match = html.match(
    /<div class="gO24Ff">[^<]+<\/div>[\s\S]{0,500}?<span jsname="Pdsbrc"[^>]*><span>([\d,.]+)<\/span>/,
  );
  const value = Number(match?.[1]?.replaceAll(",", ""));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${code} rate`);
  return value;
}

export async function GET() {
  try {
    const values = await Promise.all(currencies.map((currency) => readRate(currency.code)));
    return NextResponse.json(
      {
        rates: currencies.map((currency, index) => ({ ...currency, value: values[index] })),
        updatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "public, s-maxage=7200, stale-while-revalidate=3600" } },
    );
  } catch {
    return NextResponse.json({ error: "تعذر تحديث أسعار العملات الآن." }, { status: 503 });
  }
}
