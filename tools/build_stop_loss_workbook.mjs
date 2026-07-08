import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = "C:/Users/Camilo Mansilla/Desktop/Proyectos/Rekosol - Gestion Gastos - Copy";
const inputPath = path.join(root, "outputs", "racional_positions.json");
const outputDir = path.join(root, "outputs", "racional_stop_loss");

const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));
const rows = payload.rows;
const extractionDate = payload.extractedAt.slice(0, 10);
const outputPath = path.join(outputDir, `stop_loss_racional_${extractionDate}.xlsx`);
const previewPath = path.join(outputDir, `stop_loss_racional_${extractionDate}_preview.png`);
const startRow = 6;
const endRow = startRow + rows.length - 1;
const noteRow = endRow + 2;

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Stop Loss");
sheet.showGridLines = false;

sheet.getRange("A1:D1").merge();
sheet.getRange("A1").values = [["Stop loss por accion"]];
sheet.getRange("A1").format = {
  fill: "#174E4F",
  font: { bold: true, color: "#FFFFFF", size: 16 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
sheet.getRange("A1").format.rowHeightPx = 34;

sheet.getRange("A3:B3").values = [["Descuento stop loss", 0.03]];
sheet.getRange("A3:B3").format = {
  fill: "#E7F3F1",
  font: { bold: true, color: "#0000FF" },
  borders: { preset: "all", style: "thin", color: "#B7D5D1" },
};
sheet.getRange("B3").format.numberFormat = "0.00%";

sheet.getRange("A5:D5").values = [["Stock", "Costo promedio (US$)", "% ganancia", "Stop loss (US$)"]];
sheet.getRange("A5:D5").format = {
  fill: "#215E61",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  borders: { preset: "all", style: "thin", color: "#174E4F" },
};

const dataValues = rows.map((row) => [row.ticker, row.averageCost, row.gainPercent, null]);
sheet.getRangeByIndexes(startRow - 1, 0, dataValues.length, 4).values = dataValues;

const formulas = rows.map((_, idx) => [`=ROUND(B${startRow + idx}*(1+C${startRow + idx}-$B$3),2)`]);
sheet.getRangeByIndexes(startRow - 1, 3, formulas.length, 1).formulas = formulas;

const dataRange = sheet.getRangeByIndexes(startRow - 1, 0, rows.length, 4);
dataRange.format = {
  fill: "#FFFFFF",
  font: { color: "#0000FF" },
  borders: { preset: "all", style: "thin", color: "#D5DEE2" },
};
sheet.getRangeByIndexes(startRow - 1, 1, rows.length, 1).setNumberFormat('US$#,##0.00');
sheet.getRangeByIndexes(startRow - 1, 2, rows.length, 1).setNumberFormat("0.00%");
sheet.getRangeByIndexes(startRow - 1, 3, rows.length, 1).setNumberFormat('US$#,##0.00');

for (let i = 0; i < rows.length; i += 2) {
  sheet.getRangeByIndexes(startRow - 1 + i, 0, 1, 4).format.fill = "#F7FAFA";
}

sheet.getRange(`A5:D${endRow}`).format.borders = { preset: "all", style: "thin", color: "#D5DEE2" };
sheet.getRange(`A${startRow}:A${endRow}`).format.font = { bold: true, color: "#0000FF" };
sheet.getRange(`B${startRow}:D${endRow}`).format.horizontalAlignment = "right";
sheet.getRange(`D${startRow}:D${endRow}`).format.font = { color: "#000000" };

sheet.getRange("F5:G9").values = [
  ["Resumen", ""],
  ["Acciones", rows.length],
  ["Stop loss max.", null],
  ["Stop loss min.", null],
  ["Extraido", extractionDate],
];
sheet.getRange("G7").formulas = [[`=ROUND(MAX(D${startRow}:D${startRow + rows.length - 1}),2)`]];
sheet.getRange("G8").formulas = [[`=ROUND(MIN(D${startRow}:D${startRow + rows.length - 1}),2)`]];
sheet.getRange("F5:G5").format = {
  fill: "#215E61",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
};
sheet.getRange("F6:G9").format = {
  fill: "#F4F7F7",
  borders: { preset: "all", style: "thin", color: "#D5DEE2" },
};
sheet.getRange("F6:F9").format.font = { bold: true, color: "#374151" };
sheet.getRange("G7:G8").setNumberFormat('US$#,##0.00');

sheet.getRange(`A${noteRow}:D${noteRow}`).merge();
sheet.getRange(`A${noteRow}`).values = [["Formula usada: Costo promedio * (1 + % ganancia - descuento stop loss). Cambia B3 si quieres otro descuento. Fuente: https://app.racional.cl/tabs/home"]];
sheet.getRange(`A${noteRow}`).format = {
  fill: "#FFF8E1",
  font: { color: "#5C4500", italic: true },
  borders: { preset: "outside", style: "thin", color: "#E8D28A" },
  wrapText: true,
};

sheet.getRange("A:A").format.columnWidthPx = 132;
sheet.getRange("B:B").format.columnWidthPx = 156;
sheet.getRange("C:C").format.columnWidthPx = 118;
sheet.getRange("D:D").format.columnWidthPx = 140;
sheet.getRange("F:F").format.columnWidthPx = 120;
sheet.getRange("G:G").format.columnWidthPx = 130;
sheet.freezePanes.freezeRows(5);

const table = sheet.tables.add(`A5:D${startRow + rows.length - 1}`, true, "StopLossTable");
table.style = "TableStyleMedium2";
table.showFilterButton = true;

sheet.getRangeByIndexes(startRow - 1, 1, rows.length, 1).setNumberFormat('US$#,##0.00');
sheet.getRangeByIndexes(startRow - 1, 2, rows.length, 1).setNumberFormat("0.00%");
sheet.getRangeByIndexes(startRow - 1, 3, rows.length, 1).setNumberFormat('US$#,##0.00');
sheet.getRange("G7:G8").setNumberFormat('US$#,##0.00');

await fs.mkdir(outputDir, { recursive: true });

const inspect = await workbook.inspect({
  kind: "table",
  range: `Stop Loss!A1:G${noteRow}`,
  include: "values,formulas",
  tableMaxRows: 25,
  tableMaxCols: 8,
});
console.log(inspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({ sheetName: "Stop Loss", range: `A1:G${noteRow}`, scale: 1, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(`Saved ${outputPath}`);
process.exit(0);
