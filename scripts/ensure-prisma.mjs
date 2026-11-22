import { createRequire } from "module";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const backendPkgPath = path.join(rootDir, "backend", "package.json");
const schemaPath = path.join(rootDir, "backend", "schema.prisma");
const req = createRequire(backendPkgPath);

let needsGenerate = false;

try {
  const clientMod = req("@prisma/client");
  if (!clientMod || typeof clientMod.PrismaClient !== "function") {
    needsGenerate = true;
  } else {
    try {
      const generatedEntry = req.resolve(".prisma/client/default.js");
      const schemaMtime = fs.existsSync(schemaPath) ? fs.statSync(schemaPath).mtimeMs : 0;
      const generatedMtime = fs.statSync(generatedEntry).mtimeMs;
      if (schemaMtime > generatedMtime) {
        needsGenerate = true;
      }
    } catch {
      // Fallback: PrismaClient loaded cleanly; generate only if missing
    }
  }
} catch {
  needsGenerate = true;
}

if (needsGenerate) {
  console.log("[dev] Menyiapkan Prisma Client...");
  execSync("npm run db:generate", { cwd: rootDir, stdio: "inherit" });
}
