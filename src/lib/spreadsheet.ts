/**
 * Excel statement parsing.
 *
 * ICICI's internet banking hands you an `.xls` that is a real legacy Excel
 * file (BIFF, written by JasperReports) rather than a renamed CSV, so it has
 * to be decoded before the column-sniffing in `csv.ts` can see it. SheetJS is
 * the only JS reader that handles both BIFF `.xls` and modern `.xlsx`; the
 * `@e965` package is the maintained npm mirror of it, well past the prototype
 * pollution fixed in 0.19.3 (the abandoned `xlsx` on npm is still 0.18.5).
 */
import { read, utils } from "@e965/xlsx";
import { bad } from "./http";

/** `.xlsx` is a zip ("PK"); legacy `.xls` is an OLE compound file. */
const ZIP_MAGIC = [0x50, 0x4b];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

const startsWith = (bytes: Uint8Array, magic: number[]) =>
  magic.every((b, i) => bytes[i] === b);

/** True if these bytes look like a workbook rather than text. */
export function isSpreadsheet(bytes: Uint8Array): boolean {
  return startsWith(bytes, ZIP_MAGIC) || startsWith(bytes, OLE_MAGIC);
}

/**
 * Decode the first sheet into the same `string[][]` shape `parseCsv` produces,
 * so both file types share one parser downstream.
 */
export function spreadsheetToTable(bytes: Uint8Array): string[][] {
  let table: unknown[][];
  try {
    const wb = read(bytes, { type: "array", cellDates: false, raw: false });
    const first = wb.SheetNames[0];
    if (!first) bad("That spreadsheet has no sheets in it");
    table = utils.sheet_to_json<unknown[]>(wb.Sheets[first], {
      header: 1,
      raw: false, // formatted text, so dates keep the layout the bank chose
      blankrows: false,
      defval: "",
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("sheets in it")) throw err;
    bad("Could not read that spreadsheet — re-download it, or export it as CSV");
  }

  return table!.map((row) => (row ?? []).map((cell) => (cell == null ? "" : String(cell))));
}
