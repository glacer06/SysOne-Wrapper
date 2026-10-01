import Link from "next/link";

import { Button, Select, buttonClasses } from "~/components/ui";

import { param, type SearchParams } from "./filters";

export interface FilterField {
  name: string;
  label: string;
  /** The first option is the "any" choice and has the value "". */
  options: readonly { value: string; label: string }[];
  /** The value when the URL has none, for fields like the time range. */
  fallback?: string;
}

/**
 * One row of filters above a list. A plain GET form, so filters land in the URL, work without
 * script and survive a reload or a shared link.
 */
export function FilterForm({ action, fields, sp, clearHref, keep = [] }: { action: string; fields: readonly FilterField[]; sp: SearchParams; clearHref: string; keep?: readonly string[] }) {
  return (
    <form method="get" action={action} className="mb-5 rounded-md border border-rule bg-paper-raised p-4" aria-label="Filters">
      {/* Params set outside the form, such as the review tab, survive a filter change. */}
      {keep.map((k) => {
        const v = param(sp, k);
        return v === undefined ? null : <input key={k} type="hidden" name={k} value={v} />;
      })}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {fields.map((f) => (
          <Select key={f.name} name={f.name} label={f.label} options={f.options} defaultValue={param(sp, f.name) ?? f.fallback ?? ""} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm">
          Apply filters
        </Button>
        <Link href={clearHref} className={buttonClasses("ghost", "sm")}>
          Clear
        </Link>
      </div>
    </form>
  );
}

/** "Any" plus the labelled values of an enum. */
export function optionsOf<T extends string>(any: string, labels: Record<T, string>): { value: string; label: string }[] {
  return [{ value: "", label: any }, ...(Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }))];
}
