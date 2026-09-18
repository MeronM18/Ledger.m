import "server-only";
import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from "plaid";
import { env } from "@/lib/env";

const configuration = new Configuration({
  basePath: PlaidEnvironments[env.PLAID_ENV],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": env.PLAID_CLIENT_ID,
      "PLAID-SECRET": env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

export const PLAID_PRODUCTS = env.PLAID_PRODUCTS.split(",").map((p) => p.trim()) as Products[];
export const PLAID_COUNTRY_CODES = env.PLAID_COUNTRY_CODES.split(",").map(
  (c) => c.trim()
) as CountryCode[];
