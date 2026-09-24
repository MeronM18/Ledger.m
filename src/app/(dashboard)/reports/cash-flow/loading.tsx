export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-32 animate-pulse rounded-xl bg-muted" />
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
