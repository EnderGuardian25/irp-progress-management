/**
 * The one table vocabulary — docs/design-system.md §4 (13px body, tabular
 * figures for numbers) and §8.1's roster. Roster, Cycles and Students each
 * hand-rolled the identical `w-full text-[13px]` / muted `<th>` / `border-top
 * 1px var(--line)` chrome; this is that chrome, once.
 *
 * `numeric` on a cell selects right alignment and tabular figures — a column
 * of counts that does not line up is the specific thing §4's tabular-figures
 * rule exists to prevent.
 */
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <table className="w-full text-[13px]" style={{ color: "var(--ink)" }}>
      {children}
    </table>
  );
}

export function Th({
  children,
  numeric = false,
  ...rest
}: { children: ReactNode; numeric?: boolean } & ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      scope="col"
      className={`px-2 py-2 font-normal ${numeric ? "text-right" : "text-left"}`}
      style={{ color: "var(--ink-muted)" }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric = false,
  ...rest
}: { children: ReactNode; numeric?: boolean } & TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td {...rest} className={`px-2 py-2 ${numeric ? "tabular text-right" : ""}`}>
      {children}
    </td>
  );
}
