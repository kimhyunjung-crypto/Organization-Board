# POC-06 synthetic spreadsheet fixtures

`buildSyntheticWorkbook.ts` creates each XLSX entirely from explicit synthetic labels. Tests build the binary in memory so no real employee workbook or cell value is stored in the repository.

Covered inputs include a hidden first sheet, the first visible sheet, mixed valid and invalid rows, rich text, formulas, hyperlinks, numbers, missing and duplicate headers, merged required cells, no visible sheet, and the 1,000-row boundary.
