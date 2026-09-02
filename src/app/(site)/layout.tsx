import "@/components/site/site.css";
import { SiteNav } from "@/components/site/nav";
import { SiteFooter } from "@/components/site/footer";
import { ProducerGate } from "@/components/producer/gate";
import { createClient } from "@/lib/supabase/server";

export default async function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data: cities } = await supabase
    .from("cities")
    .select("*")
    .order("position", { ascending: true });

  return (
    <>
      <SiteNav />
      <main id="main">{children}</main>
      <SiteFooter cities={cities ?? []} />
      <ProducerGate />
    </>
  );
}
