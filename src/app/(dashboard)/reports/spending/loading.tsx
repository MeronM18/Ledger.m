export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="ml-auto h-8 w-60 animate-pulse rounded-md bg-muted" />
      <div className="h-[340px] animate-pulse rounded-xl bg-muted" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
        <div className="hidden h-60 animate-pulse rounded-xl bg-muted lg:block" />
      </div>
    </div>
  );
}
