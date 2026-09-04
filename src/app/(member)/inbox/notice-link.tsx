"use client";

import React from "react";
import Link from "next/link";
import { markRead } from "./actions";

/* A notice is a link to the thing it is about, and tapping it reads it. The
   write is fired and not awaited: the navigation is the member's intent, the
   read mark is bookkeeping, and the page they land on must not wait on it. An
   already-read notice sends nothing. */
export function NoticeLink({
  id,
  href,
  read,
  className,
  children,
}: {
  id: string;
  href: string;
  read: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [, startTransition] = React.useTransition();
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (read) return;
        startTransition(async () => {
          await markRead(id);
        });
      }}
    >
      {children}
    </Link>
  );
}
