const fs = require("node:fs");
const path = require("node:path");

const outputPath = path.resolve("C:/Users/Camilo Mansilla/Desktop/Proyectos/Rekosol - Gestion Gastos - Copy/outputs/racional_positions.json");
const homeStocksPath = path.resolve("C:/Users/Camilo Mansilla/Desktop/Proyectos/Rekosol - Gestion Gastos - Copy/outputs/racional_home_stocks.json");
const tickers = JSON.parse(fs.readFileSync(homeStocksPath, "utf8")).tickers;

function parseMoney(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function parsePercent(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value / 100 : null;
}

function extractFromText(text, ticker) {
  const marker = `Tu inversión en ${ticker}`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`No se encontró el bloque de inversión para ${ticker}`);
  const section = text.slice(start, start + 1200);
  const costMatch = section.match(/Costo promedio\s*\n\s*(US\$[^\n]+)/);
  const gainsStart = section.indexOf("Ganancias totales");
  const gainsSection = gainsStart >= 0 ? section.slice(gainsStart, gainsStart + 250) : "";
  const percentMatches = [...gainsSection.matchAll(/[-+]?\d{1,3}(?:\.\d{3})*,\d+%/g)].map((m) => m[0]);
  const gainPercentRaw = percentMatches[percentMatches.length - 1];
  if (!costMatch || !gainPercentRaw) {
    throw new Error(`Faltan datos para ${ticker}: costo=${costMatch?.[1] || "N/A"}, ganancia=${gainPercentRaw || "N/A"}`);
  }
  const averageCost = parseMoney(costMatch[1]);
  const gainPercent = parsePercent(gainPercentRaw);
  return {
    ticker,
    averageCostRaw: costMatch[1],
    gainPercentRaw,
    averageCost,
    gainPercent,
    stopLoss: averageCost * (1 + gainPercent - 0.03),
  };
}

state.page = context.pages().find((p) => p.url().includes("app.racional.cl")) || context.pages()[0];
const rows = [];
const errors = [];

for (const ticker of tickers) {
  try {
    const urlTicker = encodeURIComponent(ticker);
    await state.page.goto(`https://app.racional.cl/asset-details/${urlTicker}?home=true`, { waitUntil: "domcontentloaded" });
    try {
      await state.page.waitForFunction(
        (t) => document.body?.innerText?.includes(`Tu inversión en ${t}`),
        ticker,
        { timeout: 90000 },
      );
    } catch {
      await state.page.waitForTimeout(3000);
    }
    const text = await state.page.evaluate(() => document.body.innerText);
    rows.push(extractFromText(text, ticker));
    console.log(`OK ${ticker}`);
  } catch (error) {
    errors.push({ ticker, error: error.message });
    console.log(`ERROR ${ticker}: ${error.message}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ rows, errors, extractedAt: new Date().toISOString() }, null, 2), "utf8");
}

fs.writeFileSync(outputPath, JSON.stringify({ rows, errors, extractedAt: new Date().toISOString() }, null, 2), "utf8");
console.log(`Saved ${rows.length} rows to ${outputPath}`);
if (errors.length) console.log(JSON.stringify(errors, null, 2));
