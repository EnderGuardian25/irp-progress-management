/**
 * The one table vocabulary — docs/design-system.md §4 (13px body, tabular
 * figures for numbers) and §8.1's roster. Roster, Cycles and Students each
 * hand-rolled the identical `w-full text-[13px]` / muted `<th>` / `border-top
 * 1px var(--line)` chrome; this is that chrome, once.
 *
 * `numeric` on a cell selects right alignment and tabular figures — a column
 * of counts that does not line up is the specific thing §4's tabular-figures
 * rule exists to prevent. Pass it on the `Th` as well as the `Td`, or the
 * header sits left while its value sits right and reads as belonging to the
 * next column along.
 *
 * Horizontal padding is `px-3` (12px), the TOP of design-system §5's "roster
 * uses 8–12px row padding" range, while vertical stays `py-2` (8px). At
 * `px-2` both ways a right-aligned column's value ended up 16px from the next
 * left-aligned column's — the roster's Entries count read as though it were
 * in Extra. 12px gives 24px between adjacent content, which is what actually
 * separates a right-then-left column pair; alignment alone cannot, since the
 * two are aligned toward each other by construction. Vertical density is the
 * "dense core" signal in §5 and is deliberately not loosened with it.
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
      className={`px-3 py-2 font-normal ${numeric ? "text-right" : "text-left"}`}
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
    <td {...rest} className={`px-3 py-2 ${numeric ? "tabular text-right" : ""}`}>
      {children}
    </td>
  );
}
