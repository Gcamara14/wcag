/**
 * Generates WCAG_2.2_AA_Understanding_Full.md from understanding sources.
 * Run: npx tsx 11ty/generate-wcag-understanding-full.ts
 */
import { readFile, writeFile } from "fs/promises";
import { load } from "cheerio";

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
        // We handle headings specifically in the main loop, but for nested ones:
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

      // Default: process children
      return $el.contents().map((_, n) => processNode(n)).get().join('');
    }
    
    return '';
  }
  
  // Process the body content directly
  return processNode($('body')[0] || $.root()[0]).replace(/\n{3,}/g, '\n\n').trim();
}

// Helper to get techniques from the data file (simplified logic)
import associatedTechniquesData from "../understanding/understanding.11tydata.js";

// Mock data object for the 11ty data function
const mockData = { understandingUrl: "" };
const techniquesData = associatedTechniquesData(mockData).associatedTechniques;

/**
 * Format techniques section from data
 */
function formatTechniques(scId: string): string {
  const scTechniques = techniquesData[scId];
  if (!scTechniques) return "";

  let output = "";

  if (scTechniques.sufficient) {
    output += "\n#### Sufficient Techniques\n\n";
    output += formatTechniqueList(scTechniques.sufficient);
  }

  if (scTechniques.advisory) {
    output += "\n#### Advisory Techniques\n\n";
    output += formatTechniqueList(scTechniques.advisory);
  }

  if (scTechniques.failure) {
    output += "\n#### Failures\n\n";
    output += formatTechniqueList(scTechniques.failure);
  }

  return output;
}

function formatTechniqueList(list: any[]): string {
  if (!list || list.length === 0) return "";
  
  return list.map(item => {
    if (typeof item === 'string') {
      return `- ${item}`;
    }
    
    // Handle object techniques (situations, etc)
    if (item.title) {
      let text = `- **${item.title}**`;
      if (item.techniques) {
        text += "\n" + item.techniques.map((t: any) => {
           if (typeof t === 'string') return `  - ${t}`;
           if (t.id) return `  - ${t.id}`;
           return `  - ${JSON.stringify(t)}`; // Fallback
        }).join("\n");
      }
      return text;
    }
    
    if (item.id) {
        return `- ${item.id}`;
    }
    
    return `- ${JSON.stringify(item)}`;
  }).join("\n") + "\n";
}

async function main() {
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
    "# Understanding WCAG 2.2 AA",
    "",
    "This document contains the full Understanding WCAG guidance and is intended to be used by a custom GPT to explain intent, edge cases, and rationale behind WCAG 2.2 AA success criteria.",
    "",
  ];

  for (const sc of scList) {
    console.log(`Processing ${sc.num} ${sc.name}...`);
    lines.push(`## ${sc.num} ${sc.name}`);
    lines.push("");

    try {
      const understandingPath = `understanding/${sc.version}/${sc.id}.html`;
      const html = await readFile(understandingPath, "utf8");
      const $ = load(html);

      // Extract sections
      const sections = [
        { id: 'brief', title: 'In brief' },
        { id: 'intent', title: 'Intent' },
        { id: 'benefits', title: 'Benefits' },
        { id: 'examples', title: 'Examples' },
        { id: 'failures', title: 'Common failures' }, 
        { id: 'resources', title: 'Resources' },
        { id: 'techniques', title: 'Techniques' }
      ];

      // Process specific sections we want
      const desiredSections = ['brief', 'intent', 'benefits', 'examples', 'failures', 'resources', 'techniques'];
      
      // Check for "Additional information" or other notes that might be top-level sections in some files
      // (Though usually they are inside Intent)
      
      for (const sectionId of desiredSections) {
        const $section = $(`#${sectionId}`);
        if ($section.length) {
          // Remove the h2 heading from the section content as we'll add our own Markdown heading
          $section.find('h2').first().remove();
          
          // Special handling for 'brief': it has a DL we want to format nicely
          let content = "";
          if (sectionId === 'brief') {
             // Extract DD/DTs manually for better formatting if needed, or rely on htmlToMarkdown
             // The htmlToMarkdown handles DL/DT/DD, so we can just pass the section html
             content = htmlToMarkdown($section.html() || "");
          } else {
             content = htmlToMarkdown($section.html() || "");
          }

          if (content.trim()) {
            lines.push(`### ${sections.find(s => s.id === sectionId)?.title || sectionId}`);
            lines.push(content);
            lines.push("");
          }
        } else if (sectionId === 'techniques') {
            // Handle techniques generation from data
            const techniquesContent = formatTechniques(sc.id);
            if (techniquesContent) {
                lines.push(`### Techniques`);
                lines.push(techniquesContent);
                lines.push("");
            }
        }
      }

      // Check for any other top-level sections that are not standard (e.g. "key-terms" if relevant, but usually we skip)
      // We explicitly exclude 'resources' as per requirements.

    } catch (e) {
      console.error(`Error processing ${sc.id}:`, e);
      lines.push(`*(Error loading Understanding document)*`);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  await writeFile(
    "WCAG_2.2_AA_Understanding_Full.md",
    lines.join("\n"),
    "utf8"
  );
  console.log("Wrote WCAG_2.2_AA_Understanding_Full.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
