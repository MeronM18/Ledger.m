export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Transactions</h1>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    </div>
  );
}
