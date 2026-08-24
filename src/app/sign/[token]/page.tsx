import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/ds";
import { logDateYear, logTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import "../sign.css";
import { GuestSignPanel } from "./guest-sign-panel";

export const metadata: Metadata = {
  title: "Sign before you board",
  /* A signing link is a bearer credential. It must never reach an index. */
  robots: { index: false, follow: false },
};

const GUEST_DOC = "guest-waiver";

/* Guest signing, by token.

   A guest has no account and never will — they came aboard once, with somebody.
   The token in the address is the whole credential, the same way the calendar
   feed works. Asking a guest to make an account before they can sign a liability
   waiver is how waivers go unsigned.

   The sailing is read from the guest's own row rather than the URL, so a token
   cannot be pointed at a different voyage's document. */
export default async function GuestSignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc("guest_document", {
    p_token: token,
    p_document_code: GUEST_DOC,
  });

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) notFound();

  return (
    <main className="gsn">
      <header className="gsn-head">
        <Wordmark size="sm" />
        <h1 className="gsn-lede">
          {/* In the harbour's clock, with the year and the hour. A guest has no
              app and no manifest to check this against, and the server's zone
              had them reading a different day from the Bridge. */}
          {row.guest_name}, you&rsquo;re booked aboard <b>{row.voyage_title}</b> on{" "}
          {logDateYear(row.voyage_starts, row.voyage_time_zone)} at{" "}
          {logTime(row.voyage_starts, row.voyage_time_zone)}. Read this and sign
          before you come down to the dock.
        </h1>
      </header>

      {row.voyage_state !== "ahead" ? (
        <div className="sgn-done" role="status">
          <h2>{row.voyage_state === "cancelled" ? "That sailing was called off." : "That sailing has gone."}</h2>
          <p>
            {row.voyage_state === "cancelled"
              ? "Nothing to sign — the club called it off. Whoever booked you will know the next date."
              : "Nothing to sign — this one is already in the log. Whoever booked you will know the next date."}
          </p>
        </div>
      ) : row.already_signed ? (
        <div className="sgn-done" role="status">
          <h2>Already signed.</h2>
          <p>
            We have your signature for this sailing. Bring nothing but yourself —
            the gangway has the rest.
          </p>
        </div>
      ) : (
        <GuestSignPanel
          token={token}
          documentTitle={row.document_title}
          body={row.body}
          guestName={row.guest_name}
        />
      )}
    </main>
  );
}
