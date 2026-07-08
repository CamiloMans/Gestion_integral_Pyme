const fs = require("node:fs");
const path = require("node:path");

state.page = context.pages().find((p) => p.url().includes("app.racional.cl/tabs/home")) || state.page;
const text = await state.page.evaluate(() => document.body.innerText);
const start = text.indexOf("Stocks");
const end = text.indexOf("Cierre al", start);
const section = start >= 0 && end > start ? text.slice(start, end) : text;
const lines = section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const excluded = new Set([
  "Stocks", "Ganancia Total (%)", "inversión", "Billetera",
  "Depositar", "Comprar", "Portafolios", "Ver más", "Ver menos",
]);
const tickers = [];
for (let i = 0; i < lines.length; i++) {
  if (/^US\$[\d.,]+$/.test(lines[i + 1] || "") && lines[i + 2] === "inversión" && /^-?[\d.,]+%$/.test(lines[i + 3] || "")) {
    const ticker = lines[i];
    if (!excluded.has(ticker) && /^[A-Z0-9.]{1,8}$/.test(ticker)) tickers.push(ticker);
  }
}
const output = {
  tickers: [...new Set(tickers)],
  section,
  extractedAt: new Date().toISOString(),
};
const outputPath = path.resolve("C:/Users/Camilo Mansilla/Desktop/Proyectos/Rekosol - Gestion Gastos - Copy/outputs/racional_home_stocks.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");
console.log(JSON.stringify(output.tickers));
