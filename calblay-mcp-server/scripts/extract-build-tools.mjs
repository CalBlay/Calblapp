/**
 * Obsolet: les definicions d'eines viuen a src/services/ai-chat/tools.js.
 * Aquest script es conserva per compatibilitat; només valida que el fitxer existeixi.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "..", "src", "services", "ai-chat", "tools.js");
if (!fs.existsSync(p)) {
  console.error("Missing", p);
  process.exit(1);
}
console.log("OK: tool schemas are maintained in", p);
