state.page = context.pages().find((p) => p.url().includes("app.racional.cl/tabs/home")) || state.page;
const button = state.page.getByRole("button", { name: "Ver más" }).first();
if (await button.count()) {
  await button.click();
}
console.log("URL:", state.page.url());
console.log(await snapshot({ page: state.page, search: /Stocks|inversión|Ganancia Total|Ver menos/i }));
