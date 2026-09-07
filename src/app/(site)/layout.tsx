import "@/components/site/site.css";
import { SiteNav } from "@/components/site/nav";
import { SiteFooter } from "@/components/site/footer";
import { ProducerGate } from "@/components/producer/gate";
import { createClient } from "@/lib/supabase/server";

export default async function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
      /* A closed harbour is not a market the club is in. It stays readable by
         id so an old episode can still name where it sailed from, and it is
         kept out of every LIST a member or a visitor sees — the footer, the
         markets on the home page, the episode filter, the directory filter and
         the home-harbour picker. The Bridge still sees all of them.

         This was found by a fixture: the e2e raises one closed harbour on a
         stable slug and its comment says "CLOSED so no picker offers it",
         which was not true of any of these five. It read "E2E fixture harbour
         (closed)" at position 0 — above Miami — in the footer of every public
         page. */
      const { data: cities } = await supabase
    .from("cities")
    .select("*")
    .neq("status", "closed")
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
