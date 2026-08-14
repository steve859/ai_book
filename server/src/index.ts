import { createServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const app = createServer();

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
