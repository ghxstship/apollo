"use client";

import { Button } from "@/components/ds";

/* Wallet passes need Apple/Google signing credentials the project doesn't
   hold — until then, the browser's print dialog covers print and save-as-PDF. */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
