import app from "./app";

const port = Number(process.env.PORT || 5175);
app.listen(port, () => {
  console.log(`[server] listening on :${port}`);
});
