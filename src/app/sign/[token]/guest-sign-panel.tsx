"use client";

import { SignForm } from "@/components/member/sign-form";
import { signAsGuest } from "./actions";

export function GuestSignPanel({
  token,
  documentTitle,
  body,
  guestName,
}: {
  token: string;
  documentTitle: string;
  body: string;
  guestName: string;
}) {
  return (
    <SignForm
      documentTitle={documentTitle}
      body={body}
      askGuardian
      asGuest
      onSign={(input) =>
        signAsGuest({
          token,
          consent: input.consent,
          consentText: input.consentText,
          kind: input.kind,
          data: input.data,
          name: input.name || guestName,
          guardian: input.guardian,
          userAgent: input.userAgent,
        })
      }
    />
  );
}
