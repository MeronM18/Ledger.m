export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Spending</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="h-[380px] animate-pulse rounded-xl bg-muted" />
        <div className="h-[380px] animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
