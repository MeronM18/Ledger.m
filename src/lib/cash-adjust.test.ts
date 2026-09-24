import { describe, expect, it } from "vitest";
import { adjustedCash } from "@/lib/cash-adjust";

describe("adjustedCash", () => {
  it("adds and subtracts to the cent", () => {
    expect(adjustedCash(62823, "add", 200)).toEqual({ value: 63023 });
    expect(adjustedCash(62823, "subtract", 40.25)).toEqual({ value: 62782.75 });
    // No floating-point drift: 0.1 + 0.2 is 0.3.
    expect(adjustedCash(0.1, "add", 0.2)).toEqual({ value: 0.3 });
  });

  it("allows taking it all out, but not more", () => {
    expect(adjustedCash(50, "subtract", 50)).toEqual({ value: 0 });
    expect(adjustedCash(50, "subtract", 50.01)).toHaveProperty("error");
  });

  it("needs an amount above zero", () => {
    expect(adjustedCash(50, "add", 0)).toHaveProperty("error");
    expect(adjustedCash(50, "add", -5)).toHaveProperty("error");
    expect(adjustedCash(50, "add", Number.NaN)).toHaveProperty("error");
  });
});
