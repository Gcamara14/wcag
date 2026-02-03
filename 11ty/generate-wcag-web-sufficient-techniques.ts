/**
 * Generates WCAG_2.2_Web_Sufficient_Techniques.md
 * Run: npx tsx 11ty/generate-wcag-web-sufficient-techniques.ts
 */
import { readFile, writeFile } from "fs/promises";
import { load } from "cheerio";
import { glob } from "glob";
import { basename, sep } from "path";

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------

const WEB_TECHNOLOGIES = [
  "general",
  "html",
  "aria",
  "css",
  "client-side-script",
  "server-side-script",
];

// ----------------------------------------------------------------------------
// Helpers (duplicated/adapted from generate-wcag-understanding-full.ts)
// ----------------------------------------------------------------------------

/** Collect ordered SC paths from guidelines/index.html without flattening. */
async function getOrderedScPaths(): Promise<Array<{ version: string; slug: string; num: string }>> {
  const html = await readFile("guidelines/index.html", "utf8");
  const $ = load(html);
  const result: Array<{ version: string; slug: string; num: string }> = [];
  $("section.principle").each((pi, pel) => {
    const p = pi + 1;
    $(pel).find("section.guideline").each((gi, gel) => {
      const g = gi + 1;
      $(gel).find('section[data-include^="sc/"]').each((si, sel) => {
        const s = si + 1;
        const path = $(sel).attr("data-include") || "";
        const match = path.match(/^sc\/(20|21|22)\/(.+)\.html$/);
        if (match) {
          const [, version, slug] = match;
          result.push({ version: version!, slug, num: `${p}.${g}.${s}` });
        }
      });
    });
  });
  return result;
}

async function getScLevelAndTitle(
  version: string,
  slug: string
): Promise<{ level: string; title: string }> {
  const html = await readFile(`guidelines/sc/${version}/${slug}.html`, "utf8");
  const $ = load(html);
  const level = $("p.conformance-level").first().text().trim().replace(/^\(Level (.*)\)$/, "$1");
  const title = $("h4").first().text().trim();
  return { level, title };
}

/**
 * Converts HTML content to Markdown.
 * Preserves semantic sections and basic formatting.
 */
function htmlToMarkdown(html: string): string {
  const $ = load(html);
  
  // Remove unwanted elements
  $("script, style, link, head, meta").remove();
  
  // Helper to process nodes recursively
  function processNode(node: any): string {
    if (node.type === 'text') {
      return node.data;
    }
    
    if (node.type === 'tag') {
      const tagName = node.name;
      const $el = $(node);
      
      // Handle block elements
      if (['div', 'section', 'article'].includes(tagName)) {
        if ($el.hasClass('note')) {
          return `\n\n> **Note:**\n> ${$el.contents().map((_, n) => processNode(n)).get().join('').replace(/\n/g, '\n> ').trim()}\n\n`;
        }
        return `\n\n${$el.contents().map((_, n) => processNode(n)).get().join('')}\n\n`;
      }
      
      if (tagName === 'p') {
        return `\n\n${$el.contents().map((_, n) => processNode(n)).get().join('').trim()}\n\n`;
      }
      
      if (tagName === 'ul') {
        return `\n\n${$el.children('li').map((_, li) => {
          return `- ${$(li).contents().map((_, n) => processNode(n)).get().join('').trim()}`;
        }).get().join('\n')}\n\n`;
      }
      
      if (tagName === 'ol') {
        return `\n\n${$el.children('li').map((i, li) => {
          return `${i + 1}. ${$(li).contents().map((_, n) => processNode(n)).get().join('').trim()}`;
        }).get().join('\n')}\n\n`;
      }
      
      if (tagName === 'dl') {
        return `\n\n${$el.children().map((_, child) => {
          const $child = $(child);
          if (child.name === 'dt') return `\n**${$child.contents().map((_, n) => processNode(n)).get().join('').trim()}**\n`;
          if (child.name === 'dd') return `: ${$child.contents().map((_, n) => processNode(n)).get().join('').trim()}\n`;
          return '';
        }).get().join('')}\n\n`;
      }
      
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        // Map h2 -> ###, h3 -> ####, etc. (since SC is ##)
        const level = parseInt(tagName.substring(1));
        const hashes = '#'.repeat(Math.min(level + 2, 6)); 
        return `\n\n${hashes} ${$el.text().trim()}\n\n`;
      }
      
      // Handle inline elements
      if (tagName === 'a') {
        const href = $el.attr('href') || '';
        const text = $el.contents().map((_, n) => processNode(n)).get().join('');
        return `[${text}](${href})`;
      }
      
      if (['strong', 'b'].includes(tagName)) {
        return `**${$el.contents().map((_, n) => processNode(n)).get().join('')}**`;
      }
      
      if (['em', 'i'].includes(tagName)) {
        return `*${$el.contents().map((_, n) => processNode(n)).get().join('')}*`;
      }
      
      if (tagName === 'code') {
        return `\`${$el.text()}\``;
      }
      
      if (tagName === 'q') {
        return `"${$el.contents().map((_, n) => processNode(n)).get().join('')}"`;
      }
      
      if (tagName === 'blockquote') {
        return `\n> ${$el.contents().map((_, n) => processNode(n)).get().join('').trim()}\n`;
      }
      
      if (tagName === 'pre') {
         // Try to find code inside pre
         const code = $el.find('code').text() || $el.text();
         const lang = $el.find('code').attr('class')?.replace('language-', '') || '';
         return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
      }

      // Default: process children
      return $el.contents().map((_, n) => processNode(n)).get().join('');
    }
    
    return '';
  }
  
  // Process the body content directly
  return processNode($('body')[0] || $.root()[0]).replace(/\n{3,}/g, '\n\n').trim();
}

// ----------------------------------------------------------------------------
// Main Logic
// ----------------------------------------------------------------------------

// Import associated techniques data
import associatedTechniquesData from "../understanding/understanding.11tydata.js";
const mockData = { understandingUrl: "" };
const techniquesData = associatedTechniquesData(mockData).associatedTechniques;

/** Maps technique ID (e.g. "G94") to its technology folder (e.g. "general") */
const techniqueIdToTechnology = new Map<string, string>();

async function buildTechniqueMap() {
  const files = await glob("techniques/*/*.html");
  for (const file of files) {
    // file is like "techniques/general/G94.html"
    const parts = file.split(sep); // [techniques, general, G94.html]
    if (parts.length >= 3) {
      const technology = parts[1];
      const id = basename(parts[2], ".html");
      if (WEB_TECHNOLOGIES.includes(technology)) {
        techniqueIdToTechnology.set(id, technology);
      }
    }
  }
}

/**
 * Checks if a technique ID belongs to a Web technology.
 * Handles cases like "ARIA6" vs "aria6" if map keys are exact.
 * We assume IDs in map are exact from filename (usually uppercase like G94, ARIA6).
 */
function isWebTechnique(id: string): boolean {
  // Try exact match first
  if (techniqueIdToTechnology.has(id)) return true;
  // Try uppercase (some data might be lowercase)
  if (techniqueIdToTechnology.has(id.toUpperCase())) return true;
  return false;
}

/**
 * Gets the canonical ID (as found in filesystem) for a technique ID string.
 */
function getCanonicalId(id: string): string | undefined {
  if (techniqueIdToTechnology.has(id)) return id;
  if (techniqueIdToTechnology.has(id.toUpperCase())) return id.toUpperCase();
  return undefined;
}

/**
 * Recursively extracts technique IDs from a technique item (string or object).
 */
function extractTechniqueIds(item: any): string[] {
  const ids: string[] = [];
  
  if (typeof item === 'string') {
    ids.push(item);
  } else {
    // Handle object: { id: "..." } or { and: [...] } or { techniques: [...] }
    if (item.id) ids.push(item.id);
    if (item.and) {
        item.and.forEach((sub: any) => ids.push(...extractTechniqueIds(sub)));
    }
    // Note: 'techniques' array inside an item usually means it's a Situation object, handled by caller
  }
  
  return ids;
}

/**
 * Formats a list of techniques for the Index section, filtering to Web only.
 */
function formatWebTechniqueList(list: any[]): string {
  if (!list || list.length === 0) return "";
  
  let output = "";
  
  for (const item of list) {
    // Case 1: Simple string ID
    if (typeof item === 'string') {
      if (isWebTechnique(item)) {
        output += `- ${item}\n`;
      }
      continue;
    }
    
    // Case 2: Situation or Group object
    if (item.title) {
      // It's a situation or group with a title
      // We want to list the title, then its techniques
      
      // Collect child techniques
      let childTechniques: any[] = [];
      if (item.techniques) childTechniques = item.techniques;
      
      // Also check for groups inside a situation
      if (item.groups) {
          // Groups are just more lists of techniques
          // We can flatten them or list them under the situation
          // Let's list them under the situation title as well
          // But wait, the structure is Situation -> techniques AND Situation -> groups -> techniques
          // We should process both.
      }

      // Check if this situation/group has ANY web techniques to display
      // We don't want to print empty situations if all techniques are Flash/PDF
      
      const webTechniquesBuffer: string[] = [];
      
      // Process direct techniques
      if (item.techniques) {
        for (const t of item.techniques) {
            const extracted = extractTechniqueIds(t);
            for (const id of extracted) {
                if (isWebTechnique(id)) webTechniquesBuffer.push(id);
            }
        }
      }
      
      // Process groups
      if (item.groups) {
          for (const group of item.groups) {
              if (group.techniques) {
                  for (const t of group.techniques) {
                      const extracted = extractTechniqueIds(t);
                      for (const id of extracted) {
                          if (isWebTechnique(id)) webTechniquesBuffer.push(id);
                      }
                  }
              }
          }
      }
      
      // If we found web techniques, print the situation title and the techniques
      if (webTechniquesBuffer.length > 0) {
          output += `- **${item.title}**\n`;
          // Dedupe and print
          const unique = [...new Set(webTechniquesBuffer)];
          for (const id of unique) {
              output += `  - ${id}\n`;
          }
      }
      continue;
    }
    
    // Case 3: Object with ID (e.g. { id: "G94" }) or AND (e.g. { and: [...] })
    // These are usually top-level items in the 'sufficient' array if not inside a situation
    const extracted = extractTechniqueIds(item);
    for (const id of extracted) {
        if (isWebTechnique(id)) {
            output += `- ${id}\n`;
        }
    }
  }
  
  return output;
}

/**
 * Collects ALL Web technique IDs mentioned in a sufficient list (recursively),
 * so we know which ones to generate full content for.
 */
function collectWebTechniqueIds(list: any[]): Set<string> {
    const set = new Set<string>();
    if (!list) return set;
    
    function addIfWeb(id: string) {
        const canonical = getCanonicalId(id);
        if (canonical) set.add(canonical);
    }
    
    for (const item of list) {
        if (typeof item === 'string') {
            addIfWeb(item);
        } else {
            if (item.id) addIfWeb(item.id);
            if (item.and) item.and.forEach((sub: any) => extractTechniqueIds(sub).forEach(addIfWeb));
            if (item.techniques) {
                // Recurse for situations
                const children = collectWebTechniqueIds(item.techniques);
                children.forEach(id => set.add(id));
            }
            if (item.groups) {
                // Recurse for groups
                item.groups.forEach((g: any) => {
                    const children = collectWebTechniqueIds(g.techniques);
                    children.forEach(id => set.add(id));
                });
            }
        }
    }
    return set;
}

async function main() {
  console.log("Building technique map...");
  await buildTechniqueMap();
  console.log(`Found ${techniqueIdToTechnology.size} Web techniques.`);

  const ordered = await getOrderedScPaths();
  const withLevel = await Promise.all(
    ordered
      .filter((o) => o.slug !== "parsing")
      .map(async ({ version, slug, num }) => {
        const { level, title } = await getScLevelAndTitle(version, slug);
        return { num, id: slug, name: title, level, version };
      })
  );
  const scList = withLevel.filter((sc) => sc.level === "A" || sc.level === "AA");

  const lines: string[] = [
    "# WCAG 2.2 Web Sufficient Techniques",
    "",
    "This document contains an index of sufficient techniques for WCAG 2.2 AA (Web only), followed by the full content of each technique.",
    "",
    "## Index by success criterion",
    "",
  ];

  const allReferencedWebTechniques = new Set<string>();

  for (const sc of scList) {
    const scTechniques = techniquesData[sc.id];
    if (!scTechniques || !scTechniques.sufficient) continue;

    const sufficientSection = formatWebTechniqueList(scTechniques.sufficient);
    
    // Only add SC to index if it has Web sufficient techniques
    if (sufficientSection.trim()) {
        lines.push(`### ${sc.num} ${sc.name} (${sc.level})`);
        lines.push("**Sufficient Techniques**");
        lines.push(sufficientSection);
        lines.push("");
        
        // Collect IDs for the full content section
        const ids = collectWebTechniqueIds(scTechniques.sufficient);
        ids.forEach(id => allReferencedWebTechniques.add(id));
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("## Table of Contents (Techniques)");
  lines.push("");

  // Sort techniques for TOC and Content
  const sortedTechniqueIds = Array.from(allReferencedWebTechniques).sort((a, b) => {
      // Try to sort naturally: G1, G2, G10...
      const aMatch = a.match(/([A-Z]+)(\d+)/);
      const bMatch = b.match(/([A-Z]+)(\d+)/);
      if (aMatch && bMatch) {
          if (aMatch[1] !== bMatch[1]) return aMatch[1].localeCompare(bMatch[1]);
          return parseInt(aMatch[2]) - parseInt(bMatch[2]);
      }
      return a.localeCompare(b);
  });

  // Generate TOC
  // We need titles for the TOC. We'll read the files to get titles.
  // To avoid reading files twice (once for TOC, once for content), let's read them into memory or just read title now.
  // Actually, we can just generate the content section and build the TOC list simultaneously, then insert TOC.
  // But we're building a `lines` array.
  // Let's iterate sorted IDs, read file, get title, build content, and store TOC entry.
  
  const techniqueContentLines: string[] = [];
  const tocLines: string[] = [];

  techniqueContentLines.push("## Techniques");
  techniqueContentLines.push("");

  for (const id of sortedTechniqueIds) {
      const technology = techniqueIdToTechnology.get(id);
      if (!technology) continue; // Should not happen given logic above

      const path = `techniques/${technology}/${id}.html`;
      try {
          const html = await readFile(path, "utf8");
          const $ = load(html);
          const title = $("h1").text().trim();
          
          // Add to TOC
          tocLines.push(`- [${id}: ${title}](#${id.toLowerCase()})`);
          
          // Add to Content
          techniqueContentLines.push(`### ${id}: ${title} <a id="${id.toLowerCase()}"></a>`);
          techniqueContentLines.push("");
          
          // Extract sections
          // We want: Description, Examples, Tests, Related
          // Sometimes Applicability is useful? Plan said "Description, Examples, Tests, Related".
          
          const sections = [
              { id: 'description', title: 'Description' },
              { id: 'examples', title: 'Examples' },
              { id: 'tests', title: 'Tests' },
              { id: 'related', title: 'Related Techniques' }
          ];
          
          for (const section of sections) {
              const $sec = $(`#${section.id}`);
              if ($sec.length) {
                  // Remove h2
                  $sec.find('h2').remove();
                  const md = htmlToMarkdown($sec.html() || "");
                  if (md.trim()) {
                      techniqueContentLines.push(`#### ${section.title}`);
                      techniqueContentLines.push(md);
                      techniqueContentLines.push("");
                  }
              }
          }
          
          techniqueContentLines.push("---");
          techniqueContentLines.push("");

      } catch (e) {
          console.error(`Error processing technique ${id}:`, e);
      }
  }

  // Combine all lines
  const finalLines = [
      ...lines,
      ...tocLines,
      "",
      "---",
      "",
      ...techniqueContentLines
  ];

  await writeFile(
    "WCAG_2.2_Web_Sufficient_Techniques.md",
    finalLines.join("\n"),
    "utf8"
  );
  console.log("Wrote WCAG_2.2_Web_Sufficient_Techniques.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
