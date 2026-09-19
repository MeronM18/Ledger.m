export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Subscriptions</h1>
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
