// Pure. Which card a subscription you added is charged to, when that card's
// statements were imported (Apple Card): its name among the card's charges,
// or failing that the note left when it was added from them ("Found on your
// Apple Card"). Null for one that's truly yours alone, like cash.

export type ImportedCharge = { name: string; accountId: string | null };
export type ImportedCard = { id: string; name: string };

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function subscriptionAccount(
  sub: { name: string; notes: string | null },
  charges: ImportedCharge[],
  cards: ImportedCard[]
): ImportedCard | null {
  const name = key(sub.name);
  if (name.length >= 3) {
    // The same name, or one that starts the other and is most of it ("Netflix" and "NETFLIX.COM").
    const hit = charges.find((c) => {
      const n = key(c.name);
      if (n === name) return true;
      const [short, long] = n.length < name.length ? [n, name] : [name, n];
      return short.length >= 5 && long.startsWith(short) && short.length / long.length >= 0.7;
    });
    const card = hit && cards.find((c) => c.id === hit.accountId);
    if (card) return card;
  }
  if (/apple card/i.test(sub.notes ?? "")) return cards.find((c) => /apple card/i.test(c.name)) ?? null;
  return null;
}
