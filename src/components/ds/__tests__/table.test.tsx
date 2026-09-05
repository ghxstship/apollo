import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Table, tableColumns } from "../display";

/* Table's structure IS its accessibility: a grouped statement is one <tbody>
   per month with a scope="rowgroup" heading, a row's own heading is a
   <th scope="row"> so a reader hears the member's name rather than the column
   label, and a column of figures reads down its last digit.

   Everything here is asserted through table roles and scope attributes, which
   is what a screen reader walks. The one exception is alignment, which the kit
   expresses as a class the stylesheet reads; that is asserted as an
   EQUIVALENCE (numeric === mono + align:"end", and both differ from a plain
   column) rather than against a class name, so the rename now under way cannot
   break it while the contract holds. */

type Row = { line: string; who: string; amount: string };

const columns = tableColumns<Row>([
  { key: "line", label: "Line" },
  { key: "who", label: "Member" },
  { key: "amount", label: "Amount", numeric: true },
]);

const january: Row[] = [
  { line: "Two passes", who: "J. Clarkson", amount: "$120.00" },
  { line: "Dues credit", who: "J. Clarkson", amount: "−$20.00" },
];
const february: Row[] = [{ line: "One pass", who: "A. Reyes", amount: "$60.00" }];

/* thead and every tbody map to role="rowgroup"; the first is the header. */
const bodies = () => screen.getAllByRole("rowgroup").slice(1);

describe("Table with groups", () => {
  it("renders one row group per group, plus the header", () => {
    render(
      <Table
        columns={columns}
        groups={[
          { key: "jan", label: "January", rows: january },
          { key: "feb", label: "February", rows: february },
        ]}
      />
    );
    expect(screen.getAllByRole("rowgroup")).toHaveLength(3);
    expect(bodies()).toHaveLength(2);
  });

  it("heads each group with a scope=rowgroup cell spanning the table", () => {
    render(
      <Table
        columns={columns}
        groups={[
          { key: "jan", label: "January", rows: january },
          { key: "feb", label: "February", rows: february },
        ]}
      />
    );
    for (const [i, name] of ["January", "February"].entries()) {
      const head = within(bodies()[i]).getByRole("rowheader", { name });
      expect(head).toHaveAttribute("scope", "rowgroup");
      expect(head).toHaveAttribute("colspan", String(columns.length));
    }
  });

  it("keeps each group's rows inside its own group", () => {
    render(
      <Table
        columns={columns}
        groups={[
          { key: "jan", label: "January", rows: january },
          { key: "feb", label: "February", rows: february },
        ]}
      />
    );
    expect(within(bodies()[0]).getByText("Two passes")).toBeInTheDocument();
    expect(within(bodies()[0]).queryByText("One pass")).toBeNull();
    expect(within(bodies()[1]).getByText("One pass")).toBeInTheDocument();
  });

  it("closes a group with its summary row, last", () => {
    render(
      <Table
        columns={columns}
        groups={[
          { key: "jan", label: "January", rows: january, summary: { line: "January total", amount: "$100.00" } },
          { key: "feb", label: "February", rows: february },
        ]}
      />
    );
    const jan = bodies()[0];
    const rows = within(jan).getAllByRole("row");
    /* heading row + two lines + the summary */
    expect(rows).toHaveLength(4);
    const last = rows[rows.length - 1];
    expect(within(last).getByText("January total")).toBeInTheDocument();
    expect(within(last).getByText("$100.00")).toBeInTheDocument();
    /* A group with no summary gets no extra row. */
    expect(within(bodies()[1]).getAllByRole("row")).toHaveLength(2);
  });

  it("renders a single body when given plain rows", () => {
    render(<Table columns={columns} rows={january} />);
    expect(bodies()).toHaveLength(1);
    expect(screen.queryByRole("rowheader")).toBeNull();
  });
});

describe("Table rowHeader", () => {
  it("makes the named column the row's heading", () => {
    render(<Table columns={columns} rows={january} rowHeader="who" />);
    const heads = screen.getAllByRole("rowheader");
    expect(heads).toHaveLength(2);
    for (const h of heads) {
      expect(h).toHaveAttribute("scope", "row");
      expect(h).toHaveTextContent("J. Clarkson");
    }
  });

  it("leaves every other cell a plain data cell", () => {
    render(<Table columns={columns} rows={january} rowHeader="who" />);
    const firstRow = within(bodies()[0]).getAllByRole("row")[0];
    expect(within(firstRow).getAllByRole("cell")).toHaveLength(columns.length - 1);
    expect(within(firstRow).getAllByRole("rowheader")).toHaveLength(1);
  });

  it("renders no row heading when rowHeader is not asked for", () => {
    render(<Table columns={columns} rows={january} />);
    expect(screen.queryByRole("rowheader")).toBeNull();
  });
});

describe("Table column alignment", () => {
  /* Asserted as an equivalence, not against a class name: `numeric` is
     documented as shorthand for mono + align:"end", so whatever the kit calls
     the alignment marker, the two must produce the same cell and a plain
     column must not. */
  function cellClassFor(col: Record<string, unknown>) {
    const view = render(
      <Table
        columns={tableColumns<Row>([{ key: "amount", label: "Amount", ...col }])}
        rows={[{ line: "", who: "", amount: "$120.00" }]}
      />
    );
    const cls = view.getByRole("cell").className;
    view.unmount();
    return cls;
  }

  it("aligns a numeric column to the end, as mono + align:end does", () => {
    const numeric = cellClassFor({ numeric: true });
    const spelledOut = cellClassFor({ mono: true, align: "end" });
    const plain = cellClassFor({});
    expect(numeric).toBe(spelledOut);
    expect(numeric).not.toBe(plain);
    expect(numeric.trim()).not.toBe("");
  });

  it("carries the same alignment into the column header, so the two line up", () => {
    render(<Table columns={columns} rows={january} />);
    const amount = screen.getByRole("columnheader", { name: "Amount" });
    const line = screen.getByRole("columnheader", { name: "Line" });
    expect(amount.className.trim()).not.toBe("");
    expect(amount.className).not.toBe(line.className);
  });

  it("carries it into a summary cell too", () => {
    render(
      <Table
        columns={columns}
        groups={[{ key: "jan", label: "January", rows: january, summary: { amount: "$100.00" } }]}
      />
    );
    const figure = screen.getByText("$100.00");
    const body = screen.getByText("$120.00");
    expect(figure.className).toBe(body.className);
  });
});

describe("Table headers", () => {
  it("names an unlabelled action column rather than leaving a silent header", () => {
    render(
      <Table
        columns={tableColumns<Row>([{ key: "line", label: "Line" }, { key: "who", label: "" }])}
        rows={january}
      />
    );
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();
  });
});

describe("Table onRowClick", () => {
  it("is reachable by keyboard as well as by pointer", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<Table columns={columns} rows={january} onRowClick={onRowClick} />);
    const row = within(bodies()[0]).getAllByRole("row")[0];
    await user.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    row.focus();
    await user.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it("does not fire when the click landed on a control inside the row", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onRemove = vi.fn();
    render(
      <Table
        columns={tableColumns<Row>([
          { key: "line", label: "Line" },
          { key: "who", label: "", render: () => <button type="button" onClick={onRemove}>Remove</button> },
        ])}
        rows={january.slice(0, 1)}
        onRowClick={onRowClick}
      />
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    /* The row's dialog must not open behind the button that was pressed. */
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
