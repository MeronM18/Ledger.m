import { describe, expect, it } from "vitest";
import { subscriptionAccount } from "@/lib/subscription-accounts";

const apple = { id: "manual:ac", name: "Apple Card" };
const charges = [
  { name: "HP *INSTANT INK", accountId: "manual:ac" },
  { name: "Snapchat", accountId: "manual:ac" },
  { name: "Trader Joe's", accountId: "manual:ac" },
];

describe("subscriptionAccount", () => {
  it("finds the card a subscription is charged to by its name among the card's charges", () => {
    expect(subscriptionAccount({ name: "Hp *instant Ink", notes: null }, charges, [apple])).toBe(apple);
    expect(subscriptionAccount({ name: "Snapchat+", notes: null }, charges, [apple])).toBe(apple);
    expect(subscriptionAccount({ name: "Netflix", notes: null }, [{ name: "NETFLIX.COM", accountId: "manual:ac" }], [apple])).toBe(apple);
  });

  it("falls back on the note left when it was added from the card's statements", () => {
    expect(subscriptionAccount({ name: "iCloud+", notes: "Found on your Apple Card" }, charges, [apple])).toBe(apple);
  });

  it("leaves one you added by hand alone, and doesn't match on a short or partial name", () => {
    expect(subscriptionAccount({ name: "Gym", notes: null }, charges, [apple])).toBeNull();
    expect(subscriptionAccount({ name: "Trader", notes: "cash" }, charges, [apple])).toBeNull();
    expect(subscriptionAccount({ name: "Snap", notes: null }, charges, [apple])).toBeNull();
  });

  it("needs the card itself to be known", () => {
    expect(subscriptionAccount({ name: "Snapchat", notes: "Found on your Apple Card" }, charges, [])).toBeNull();
  });
});
