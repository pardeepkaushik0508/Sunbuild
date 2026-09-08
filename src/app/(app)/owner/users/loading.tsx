export default function UsersLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-14 rounded-[14px] bg-[#fff8e1]" />
      <div className="overflow-hidden rounded-[16px] border border-[#e5e7eb] bg-white">
        <div className="h-12 border-b border-[#e5e7eb] bg-[#f9fafb]" />
        <div className="grid grid-cols-2 gap-4 p-5 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 rounded bg-[#e5e7eb]" />
              <div className="h-8 w-12 rounded bg-[#e5e7eb]" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="h-7 w-56 rounded bg-[#e5e7eb]" />
        <div className="h-9 w-28 rounded bg-[#fde68a]" />
      </div>
      <div className="space-y-3 rounded-[16px] border border-[#e5e7eb] bg-white p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="h-11 w-11 rounded-full bg-[#e5e7eb]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-[#e5e7eb]" />
              <div className="h-3 w-52 rounded bg-[#f3f4f6]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
