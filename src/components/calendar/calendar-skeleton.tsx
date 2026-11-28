/** Grey blocks shaped like two day headings and their cards. */
export function CalendarSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Laddar">
      {["w-40", "w-44"].map((width) => (
        <div key={width}>
          <div className={`mt-4 mb-2 h-3.5 rounded bg-muted ${width}`} />
          <div className="mb-2 h-14 rounded-xl bg-muted" />
          <div className="h-14 rounded-xl bg-muted" />
        </div>
      ))}
    </div>
  );
}
