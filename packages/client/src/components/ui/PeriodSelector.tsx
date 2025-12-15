import { PERIOD_OPTIONS, type TraktPeriod } from "../../hooks/useDiscoverFilters";

interface PeriodSelectorProps {
  period: TraktPeriod;
  onPeriodChange: (period: TraktPeriod) => void;
}

export function PeriodSelector({ period, onPeriodChange }: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-white/50">Time period:</span>
      <div className="flex gap-1">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onPeriodChange(option.value)}
            className={`px-3 py-1.5 text-xs rounded transition-all duration-150 ${
              period === option.value
                ? "bg-annex-500/30 text-annex-300 border border-annex-500/50"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/80"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
