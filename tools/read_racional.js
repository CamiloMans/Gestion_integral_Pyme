state.page = context.pages().find((p) => p.url().includes("app.racional.cl")) || context.pages()[0];
await state.page.waitForLoadState("domcontentloaded");
console.log("URL:", state.page.url());
console.log(await snapshot({ page: state.page }));
