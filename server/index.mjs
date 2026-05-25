import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJindouServer, loadEnvFiles } from "./jindouServer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFiles(root);

const port = Number(process.env.API_PORT || 8787);
const server = createJindouServer({ root });

server.listen(port, "127.0.0.1", () => {
  console.log(`Jindou Agent API proxy running on http://127.0.0.1:${port}`);
});
