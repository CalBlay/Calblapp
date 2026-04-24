/**
 * Obsolet: edit src/services/ai-chat/tools.js directament.
 * Abans extreia buildTools() de ai-chat.service.js; ara el servei importa tools.js.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolsPath = join(__dirname, "..", "src", "services", "ai-chat", "tools.js");
if (!existsSync(toolsPath)) {
  console.error("Missing:", toolsPath);
  process.exit(1);
}
console.log("Tool definitions:", toolsPath, "(edit this file)");
