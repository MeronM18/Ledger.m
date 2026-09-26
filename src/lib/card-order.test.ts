import { describe, expect, it } from "vitest";
import { applyCardOrder } from "@/lib/card-order";

const id = (s: string) => s;

describe("applyCardOrder", () => {
  it("keeps the default order when nothing is saved", () => {
    expect(applyCardOrder(["a", "b", "c"], id, [])).toEqual(["a", "b", "c"]);
  });

  it("follows the saved order", () => {
    expect(applyCardOrder(["a", "b", "c"], id, ["c", "a", "b"])).toEqual(["c", "a", "b"]);
  });

  it("puts cards the saved order doesn't know about first", () => {
    expect(applyCardOrder(["new1", "a", "new2", "b"], id, ["b", "a"])).toEqual(["new1", "new2", "b", "a"]);
  });

  it("skips saved ids whose card is gone", () => {
    expect(applyCardOrder(["a", "b"], id, ["gone", "b", "a"])).toEqual(["b", "a"]);
  });

  it("works on objects through the key function", () => {
    const cards = [{ id: "x" }, { id: "y" }];
    expect(applyCardOrder(cards, (c) => c.id, ["y", "x"])).toEqual([{ id: "y" }, { id: "x" }]);
  });

  it("can put a new item where it sits by default, after the one before it", () => {
    const id = (s: string) => s;
    // "cash" follows "worth" by default; the saved order moved "spent" first.
    expect(applyCardOrder(["worth", "cash", "spent", "income"], id, ["spent", "worth", "income"], { fresh: "in-place" })).toEqual(["spent", "worth", "cash", "income"]);
    // One with nothing before it goes first.
    expect(applyCardOrder(["safe", "budget", "upcoming"], id, ["upcoming", "budget"], { fresh: "in-place" })).toEqual(["safe", "upcoming", "budget"]);
    // Nothing saved: the default order.
    expect(applyCardOrder(["a", "b"], id, [], { fresh: "in-place" })).toEqual(["a", "b"]);
  });
});
