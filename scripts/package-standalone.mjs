import { cpSync } from "node:fs";

// Match the container's standalone layout for local production starts too.
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
cpSync("public", ".next/standalone/public", { recursive: true });
