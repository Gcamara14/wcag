/**
 * Generates AccName_Computation.md from accname/bookmarklet.js
 * Run: npx tsx 11ty/generate-accname.ts
 */
import { readFile, writeFile } from "fs/promises";

async function main() {
  const js = await readFile("accname/bookmarklet.js", "utf8");

  // Extract Helpers
  const helpersMatch = js.match(/\/\/ --- Helpers ---([\s\S]+?)\/\/ --- Computation Logic ---/);
  const helpersCode = helpersMatch ? helpersMatch[1].trim() : "// Could not extract Helpers";

  // Extract Computation Logic
  const logicMatch = js.match(/\/\/ --- Computation Logic ---([\s\S]+?)\/\/ --- Validation Rules ---/);
  const logicCode = logicMatch ? logicMatch[1].trim() : "// Could not extract Computation Logic";

  // Extract Rules array content for parsing
  const rulesMatch = js.match(/const Rules = \[([\s\S]+?)\];/);
  const rulesCode = rulesMatch ? rulesMatch[1] : "";
  
  const rules: any[] = [];
  // Regex to extract rule objects with basic properties
  // We look for id, title, severity.
  const ruleRegex = /id:\s*'([^']+)',\s+title:\s*'([^']+)',\s+severity:\s*'([^']+)'/g;
  let match;
  while ((match = ruleRegex.exec(rulesCode)) !== null) {
      rules.push({ id: match[1], title: match[2], severity: match[3] });
  }

  const lines = [
    "# Accessible Name and Description Computation",
    "",
    "This document describes the logic for computing the accessible name and description, based on the `accname` bookmarklet implementation.",
    "",
    "## Helpers",
    "",
    "Helper functions used in the computation:",
    "",
    "```javascript",
    helpersCode,
    "```",
    "",
    "## Computation Logic",
    "",
    "The core logic for computing the accessible name:",
    "",
    "```javascript",
    logicCode,
    "```",
    "",
    "## Validation Rules",
    "",
    "The following rules are applied to validate the computed names:",
    "",
    "| ID | Severity | Title |",
    "|---|---|---|",
    ...rules.map(r => `| ${r.id} | ${r.severity} | ${r.title} |`),
    "",
    "## Full Source",
    "",
    "The complete source code of the bookmarklet:",
    "",
    "```javascript",
    js,
    "```"
  ];

  await writeFile("AccName_Computation.md", lines.join("\n"), "utf8");
  console.log("Wrote AccName_Computation.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
