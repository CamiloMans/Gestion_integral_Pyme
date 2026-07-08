state.page = context.pages().find((p) => p.url().includes("app.racional.cl")) || context.pages()[0];
await state.page.waitForLoadState("domcontentloaded");
await state.page.getByText("AMD", { exact: true }).click();
await waitForPageLoad({ page: state.page, timeout: 5000 });
console.log("URL:", state.page.url());
console.log(await snapshot({ page: state.page }));
