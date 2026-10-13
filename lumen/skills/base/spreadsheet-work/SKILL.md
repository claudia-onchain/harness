---
name: spreadsheet-work
description: "Cleans, reshapes, analyzes and builds spreadsheets (CSV, XLSX, Google Sheets): inspecting with csvkit and DuckDB, fixing dates, numbers and token decimals, lookups and pivots with XLOOKUP, SUMIFS and QUERY, formula-safe exports and reproducible scripts. Use when someone asks \"clean this spreadsheet\", \"merge these CSVs\", \"pivot this\", \"write a formula\", \"convert to xlsx\", \"export my transactions to a sheet\" or \"why is this formula wrong\"."
license: MIT
metadata:
  title: "Spreadsheet work"
  category: "build"
  level: "beginner"
  tags: "spreadsheets, csv, xlsx, google sheets, excel, formulas, xlookup, pivot, duckdb, csvkit, cleaning"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Spreadsheet work

Treat the original file as read-only, do every transformation in a script or a clearly separated sheet, and
check row counts and totals after each step. Most spreadsheet bugs are silent: dates parsed as text, numbers
with thousands separators read as strings, token amounts rounded by floats, or a lookup that quietly matched
nothing. Verify with totals you can explain.

## When to use

- "Clean up this CSV / Excel export" or "merge these files".
- "Write a formula that..." or "why does this VLOOKUP return #N/A".
- Pivot tables, monthly summaries, per-category totals.
- Exporting wallet transfers, trades or invoices into a sheet for an accountant.
- Converting between CSV, XLSX and Google Sheets without breaking data.

## Steps

1. **Inspect before touching.** Keep the original; work on a copy.
   ```sh
   head -5 data.csv && wc -l data.csv
   csvstat data.csv                                    # csvkit: types, nulls, min/max per column
   duckdb -c "DESCRIBE SELECT * FROM 'data.csv'"
   duckdb -c "SELECT * FROM 'data.csv' LIMIT 10"
   ```
   Note delimiter, encoding (UTF-8 vs UTF-16 from Excel), header row, and which columns are dates, amounts, IDs.
   In Lumen, `read_file` shows the head; heavier work goes through `bash` with DuckDB or Python.
2. **Fix types explicitly.** Dates to ISO `YYYY-MM-DD` (or UTC timestamps), amounts to numbers without currency
   symbols or thousands separators, IDs and addresses as text (leading zeros and `0x…` must survive). Decide
   the timezone once and write it in the header (`date_utc`).
3. **Handle token amounts with integers.** On-chain values are raw integers: divide by `10^decimals` only for
   display (18 for ETH and most ERC-20s, 6 for USDC/USDT, 9 for SOL lamports). Do the math in DuckDB
   `DECIMAL(38,18)`, Python `Decimal` or viem's `formatUnits`, never JavaScript floats.
4. **Transform in a script, not by hand.** DuckDB SQL is the fastest path for joins and pivots:
   ```sh
   duckdb -c "COPY (
     SELECT date_trunc('month', CAST(ts AS TIMESTAMP)) AS month, category, SUM(amount) AS total, COUNT(*) AS n
     FROM 'transactions.csv' GROUP BY ALL ORDER BY month, category
   ) TO 'monthly.csv' (HEADER)"
   ```
   Join files on a cleaned key (`lower(trim(address))`). Count rows before and after every join; a growing
   count means duplicate keys.
5. **Write formulas that fail loudly.** Prefer:
   - `=XLOOKUP(A2, Prices!A:A, Prices!B:B, "MISSING")` over `VLOOKUP` (no column index, explicit not-found);
   - `=SUMIFS(Amounts, Categories, "fees", Dates, ">="&DATE(2026,1,1))` for conditional totals;
   - Google Sheets `=QUERY(A:D, "select B, sum(D) where C = 'swap' group by B", 1)` for quick pivots;
   - `=IFERROR(x, "")` only when blank is the right answer; otherwise it hides bugs.
   Use tables / named ranges instead of `A2:A9999`. Keep inputs, calculations and outputs on separate tabs.
6. **Pivot and summarize.** Pivot tables for exploration; for anything shared, a formula or SQL summary that
   can be re-run. Always add a totals row and reconcile it with the raw data total.
7. **Export safely.** Write UTF-8 CSV with a header. Cells from outside sources (token names, memos, user
   input) starting with `=`, `+`, `-`, `@`, tab or CR can execute as formulas when opened: prefix them with
   `'`. For XLSX output use a library (Python `openpyxl`, Node `exceljs`) and set column types.
8. **Document it.** A short note at the top of the summary tab or in the script: source files, date range,
   timezone, filters, and the reconciliation numbers.

## Quick fixes

| Symptom | Cause | Fix |
|---|---|---|
| `#N/A` from lookups | trailing spaces, number vs text keys | `TRIM`, `VALUE`/`TEXT`, or clean keys in SQL |
| Dates sort wrong | dates stored as text, mixed formats | parse to ISO dates once, then format for display |
| Totals off by cents | float rounding | round only at display; sum raw integers or decimals |
| Leading zeros or `0x` lost | column typed as number | import as text; set column type before pasting |
| Garbled accents | UTF-16 or Windows-1252 export | `iconv -f UTF-16 -t UTF-8 in.csv > out.csv` |

## Check before you finish

- [ ] Original file untouched; the transformation is a script or documented steps.
- [ ] Row counts and grand totals reconcile between raw input and output.
- [ ] Dates, amounts and IDs have explicit types and one timezone.
- [ ] Token amounts are computed with integers/decimals, not floats.
- [ ] Lookups show explicit not-found values; no blanket `IFERROR` hiding errors.
- [ ] Outside text in exported cells is formula-escaped.

## Pitfalls

- **Excel auto-conversion.** Opening a CSV in Excel turns `1-2` into dates and long IDs into `1.23E+18`. Import with types set.
- **Editing in place.** One accidental sort of a single column scrambles the dataset. Keep originals; use tables.
- **Merged cells and color as data.** Neither survives export or formulas. Put the meaning in a column.
- **Hard-coded numbers in formulas.** `=B2*0.0725` hides the assumption; put the rate in a labeled cell.
- **Treating summaries as advice.** A P&L sheet is bookkeeping, not tax or financial advice; flag assumptions.

## Related

- `data-analysis-csv-json` — deeper analysis and charts on the cleaned data.
- `tax-ready-ledgers` — turning on-chain history into accountant-ready sheets.
- `portfolio-and-pnl` — cost basis and P&L calculations.
- `responsible-scraping` — collecting tabular data from the web.
