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
});
