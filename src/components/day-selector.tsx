import { CalendarDays } from "lucide-react";
import { buildDayOptions } from "@/lib/days";

export function DaySelector({
  value,
  onChange,
  days = 7,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  days?: number;
  className?: string;
}) {
  const options = buildDayOptions(days);
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="inline-flex w-20 shrink-0 items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <CalendarDays className="size-3.5" /> Day
      </span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-full border px-3 py-1.5 text-xs leading-tight transition-colors ${
            value === option.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
          }`}
        >
          <span className="block font-medium">{option.label}</span>
          <span className="block text-[10px] opacity-80">{option.sublabel}</span>
        </button>
      ))}
    </div>
  );
}
