state.page = await context.newPage();
await state.page.goto("https://app.racional.cl/tabs/home", { waitUntil: "domcontentloaded" });
await waitForPageLoad({ page: state.page, timeout: 10000 });
console.log("URL:", state.page.url());
console.log(await snapshot({ page: state.page, search: /Stocks|Ingresar|Iniciar|Total Inversiones/i }));
