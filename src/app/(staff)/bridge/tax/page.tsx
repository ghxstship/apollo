import type { Metadata } from "next";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { TaxClient, type CityTaxCard } from "./tax-client";

export const metadata: Metadata = { title: "Tax" };

/* The console city_tax was missing. The table has held a row per city since
   the 3rd with nowhere to type into it, so the only way to record what the
   accountant said was SQL — and a determination nobody can record is one
   nobody makes. */
export default async function TaxPage() {
  const { supabase } = await getOperator();
  const [citiesRes, taxRes] = await Promise.all([
    supabase.from("cities").select("id, name, status").order("position"),
    supabase.from("city_tax").select("*"),
  ]);
  const byCity = new Map(must(taxRes).map((t) => [t.city_id, t]));
  const cards: CityTaxCard[] = must(citiesRes).map((c) => {
    const t = byCity.get(c.id);
    return {
      cityId: c.id,
      name: c.name,
      status: c.status,
      admissionsBp: t?.admissions_rate_bp ?? null,
      goodsBp: t?.goods_rate_bp ?? null,
      registered: t?.registered ?? false,
      determinedBy: t?.determined_by ?? "",
      determinedOn: t?.determined_on ?? "",
      note: t?.note ?? "",
    };
  });

  return (
    <div>
      <span className="hm-eyebrow">Tax</span>
      <h1 className="hm-h1">What each city taxes, and who said so.</h1>
      <p className="hm-lede">
        Nothing is charged until a city carries a rate and the club is registered
        to collect it. A blank rate means undetermined; zero means determined to be
        untaxed. Admissions covers passes, deposits and add-ons; goods covers the
        galley and the shop. Record the accountant&rsquo;s answer here, with their
        name and the date, and every charge from then on carries its tax.
      </p>
      <TaxClient cards={cards} />
    </div>
  );
}
