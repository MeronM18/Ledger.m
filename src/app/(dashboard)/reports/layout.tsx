import { ReportsTabs } from "@/components/reports-tabs";

/** Reports: spending, income, cash flow and the year, as tabs of one page. */
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Room at the right for the alerts bell. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 md:pr-12">
        <h1 className="font-serif text-2xl font-semibold text-bone">Reports</h1>
        <ReportsTabs />
      </div>
      {children}
    </div>
  );
}
