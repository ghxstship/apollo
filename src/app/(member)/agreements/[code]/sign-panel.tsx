"use client";

import { SignForm } from "@/components/member/sign-form";
import { signDocument } from "../actions";

export function SignPanel({
  documentCode,
  documentTitle,
  body,
}: {
  documentCode: string;
  documentTitle: string;
  body: string;
}) {
  return (
    <SignForm
      documentTitle={documentTitle}
      body={body}
      onSign={(input) =>
        signDocument({
          documentCode,
          /* The same context the page rendered with, so the hash the server
             computes is a hash of what the member actually read. */
          context: { class: "sea" },
          consent: input.consent,
          consentText: input.consentText,
          kind: input.kind,
          data: input.data,
          name: input.name,
          userAgent: input.userAgent,
        })
      }
    />
  );
}
