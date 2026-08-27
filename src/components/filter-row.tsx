/**
 * filter-row.tsx — one filter, rendered as a dropdown.
 *
 * These were rows of pills, which worked when there were four chains and grew
 * unusable at seven chains and eight emirates: three wrapping rows of buttons
 * above the results, pushing the films off-screen on a phone. A dropdown stays
 * one line whatever the option count.
 *
 * The date picker is deliberately still a row — you scan a week at a glance and
 * pick a day, which is browsing rather than filtering.
 *
 * Shared by /cinemas and /movie/$slug rather than copied. The last time a
 * control was duplicated across these pages the two copies drifted, and the
 * fixes made to one silently did not reach the other.
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function FilterRow({
  label,
  allLabel,
  value,
  onChange,
  options,
}: {
  label: string;
  /** Wording for the no-filter option. Passed in rather than derived: adding
   *  an "s" to the label gave "All citys". */
  allLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full min-w-[9rem] text-sm">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
