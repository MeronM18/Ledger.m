import "server-only";
import { getDocumentProxy } from "unpdf";
import type { StatementPage } from "@/lib/statement-import";

/** Every page's text, as items with their position, for the statement parser. */
export async function pdfPages(bytes: Uint8Array): Promise<StatementPage[]> {
  const pdf = await getDocumentProxy(bytes);
  const pages: StatementPage[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const { items } = await (await pdf.getPage(n)).getTextContent();
    pages.push(
      items.flatMap((item) =>
        "str" in item ? [{ str: item.str, x: item.transform[4] as number, y: item.transform[5] as number }] : []
      )
    );
  }
  return pages;
}
