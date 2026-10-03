import { checkWork } from "./check.ts";

const dir = process.argv[2] ?? "works/mystery-fixture";
const result = checkWork(dir);

for (const issue of [...result.errors, ...result.warnings]) {
  const where = [
    issue.work,
    issue.file,
    issue.scene !== undefined ? `scene ${issue.scene}` : undefined,
    issue.instruction !== undefined ? `instruction ${issue.instruction}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  console.log(`${issue.level}: ${where}${where ? ": " : ""}${issue.message}`);
}

if (!result.ok) {
  process.exit(1);
}
