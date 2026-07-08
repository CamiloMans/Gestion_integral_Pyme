console.log(JSON.stringify(context.pages().map((page, index) => ({
  index,
  url: page.url(),
})), null, 2));
