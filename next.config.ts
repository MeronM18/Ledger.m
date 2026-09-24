import type { NextConfig } from "next";

// Pages that moved: Spending, Income, Cash flow and Year in review are tabs
// of Reports now, Assets is part of Accounts, and Subscriptions is
// Recurring. Old links and bookmarks still land in the right place.
const MOVED: [string, string][] = [
  ["/spending", "/reports/spending"],
  ["/income", "/reports/income"],
  ["/cash-flow", "/reports/cash-flow"],
  ["/year-in-review", "/reports/year"],
  ["/assets", "/accounts"],
  ["/subscriptions", "/recurring"],
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  async redirects() {
    return MOVED.map(([source, destination]) => ({ source, destination, permanent: false }));
  },
};

export default nextConfig;
