/**
 * Seasonal / event chips shown below the filter bar.
 * Each chip is shown from `showBefore` days before its start until `end`.
 * Dates are month/day in the Gregorian calendar (approximate for lunar events).
 */

interface SeasonalEvent {
  name: string;
  label: string;
  searchTerm: string; // keyword dropped into the search box on click
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  showBefore: number;
}

const EVENTS: SeasonalEvent[] = [
  { name: "Super Bowl",     label: "Super Bowl",     searchTerm: "super bowl",    startMonth: 2,  startDay: 8,  endMonth: 2,  endDay: 9,  showBefore: 30 },
  { name: "Valentine's",    label: "Valentine's",    searchTerm: "valentine",     startMonth: 2,  startDay: 14, endMonth: 2,  endDay: 15, showBefore: 21 },
  { name: "Ramadan",        label: "Ramadan",        searchTerm: "ramadan",       startMonth: 2,  startDay: 18, endMonth: 3,  endDay: 19, showBefore: 30 },
  { name: "Mother's Day",   label: "Mother's Day",   searchTerm: "mother",        startMonth: 5,  startDay: 10, endMonth: 5,  endDay: 11, showBefore: 21 },
  { name: "Cannes Lions",   label: "Cannes Lions",   searchTerm: "cannes",        startMonth: 6,  startDay: 16, endMonth: 6,  endDay: 21, showBefore: 30 },
  { name: "World Cup",      label: "World Cup",      searchTerm: "world cup",     startMonth: 6,  startDay: 11, endMonth: 7,  endDay: 19, showBefore: 30 },
  { name: "Back to School", label: "Back to School", searchTerm: "school",        startMonth: 8,  startDay: 15, endMonth: 9,  endDay: 10, showBefore: 21 },
  { name: "Halloween",      label: "Halloween",      searchTerm: "halloween",     startMonth: 10, startDay: 31, endMonth: 11, endDay: 1,  showBefore: 21 },
  { name: "Diwali",         label: "Diwali",         searchTerm: "diwali",        startMonth: 11, startDay: 5,  endMonth: 11, endDay: 6,  showBefore: 21 },
  { name: "Black Friday",   label: "Black Friday",   searchTerm: "black friday",  startMonth: 11, startDay: 27, endMonth: 11, endDay: 30, showBefore: 14 },
  { name: "Christmas",      label: "Christmas",      searchTerm: "christmas",     startMonth: 12, startDay: 25, endMonth: 12, endDay: 26, showBefore: 45 },
  { name: "New Year",       label: "New Year",       searchTerm: "new year",      startMonth: 1,  startDay: 1,  endMonth: 1,  endDay: 3,  showBefore: 14 },
];

function toDateThisYear(month: number, day: number, year: number) {
  return new Date(year, month - 1, day);
}

function isVisible(event: SeasonalEvent): boolean {
  const now = new Date();
  const year = now.getFullYear();

  // Try current year, then next year (for events early in Jan etc.)
  for (const y of [year, year + 1]) {
    const start = toDateThisYear(event.startMonth, event.startDay, y);
    const end = toDateThisYear(event.endMonth, event.endDay, y);
    const showFrom = new Date(start);
    showFrom.setDate(showFrom.getDate() - event.showBefore);

    if (now >= showFrom && now <= end) return true;
  }
  return false;
}

function daysUntil(event: SeasonalEvent): number {
  const now = new Date();
  const year = now.getFullYear();
  for (const y of [year, year + 1]) {
    const start = toDateThisYear(event.startMonth, event.startDay, y);
    if (start >= now) {
      return Math.ceil((start.getTime() - now.getTime()) / 86400000);
    }
  }
  return 0;
}

interface Props {
  onSelect: (searchTerm: string) => void;
}

export function SeasonalChips({ onSelect }: Props) {
  const visible = EVENTS.filter(isVisible).slice(0, 5);
  if (visible.length === 0) return null;

  return (
    <div className="container pb-3 flex items-center gap-3 flex-wrap">
      <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground/60 shrink-0">
        Now
      </span>
      {visible.map((ev) => {
        const days = daysUntil(ev);
        const isLive = days === 0;
        return (
          <button
            key={ev.name}
            type="button"
            onClick={() => onSelect(ev.searchTerm)}
            className="group relative overflow-hidden flex items-center gap-3 border hairline hover:border-primary/60 bg-background/40 hover:bg-primary/5 transition-all duration-300 px-4 py-3 text-left"
          >
            {/* Left accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-[2px] transition-all duration-300 ${isLive ? "bg-primary" : "bg-primary/20 group-hover:bg-primary/60"}`} />

            <div className="pl-1">
              <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground/60 leading-none mb-1.5">
                {isLive ? "Live now" : `in ${days}d`}
              </p>
              <p className="font-display text-base font-black tracking-tight leading-none group-hover:text-primary transition-colors">
                {ev.label}
              </p>
            </div>

            {/* Hover shimmer */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
              style={{ background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.03) 50%, transparent 60%)" }}
            />
          </button>
        );
      })}
    </div>
  );
}
