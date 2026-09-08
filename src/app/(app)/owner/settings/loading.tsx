export default function SettingsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
      <div className="h-[88px] animate-pulse rounded-[16px] border border-sb-border bg-white" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {[0, 1].map((col) => (
          <div key={col} className="space-y-3">
            <div className="h-5 w-48 animate-pulse rounded bg-sb-border/70" />
            {[0, 1, 2, 3].slice(0, col === 0 ? 4 : 3).map((i) => (
              <div
                key={i}
                className="h-[76px] animate-pulse rounded-[16px] border border-sb-border bg-white"
              />
            ))}
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-6 w-64 animate-pulse rounded bg-sb-border/70" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-[12px] border border-sb-border bg-white"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
