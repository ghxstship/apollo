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
      askCamera
      onSign={(input) =>
        signAsGuest({
          token,
          consent: input.consent,
          consentText: input.consentText,
          kind: input.kind,
          data: input.data,
          name: input.name || guestName,
          guardian: input.guardian,
          onCamera: input.onCamera,
          userAgent: input.userAgent,
        })
      }
    />
  );
}
