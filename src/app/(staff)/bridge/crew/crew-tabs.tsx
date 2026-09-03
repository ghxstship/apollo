"use client";

import React from "react";
import { Tabs } from "@/components/ds";

/* Two jobs under one heading, and they really are two: the pipeline turns
   applicants into crew, the rota puts crew on nights. Tabs rather than one long
   page because an operator is doing one or the other, never both at once. */
export function CrewTabs({
  pipeline,
  rota,
  shortCount,
}: {
  pipeline: React.ReactNode;
  rota: React.ReactNode;
  shortCount: number;
}) {
  const [tab, setTab] = React.useState<"rota" | "pipeline">(
    /* Opens on whichever is on fire. A short night is time-bound in a way a
       candidate in the funnel is not. */
    shortCount > 0 ? "rota" : "pipeline"
  );

  return (
    <>
      <Tabs
        items={[
          { id: "rota", label: shortCount > 0 ? `Rota (${shortCount} short)` : "Rota" },
          { id: "pipeline", label: "Pipeline" },
        ]}
        value={tab}
        onChange={(id) => setTab(id as "rota" | "pipeline")}
      />
      <div className="hm-tabbody">{tab === "rota" ? rota : pipeline}</div>
    </>
  );
}
