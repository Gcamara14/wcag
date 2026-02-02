/**
 * Generates WCAG_2.2_AA_Design_System_Reference.md from guidelines and understanding sources.
 * Run: npx tsx 11ty/generate-wcag-design-system-reference.ts
 */
import { readFile, writeFile } from "fs/promises";
import { load } from "cheerio";

const GITHUB_BASE =
  "https://github.com/w3c/wcag/blob/main/guidelines/sc";

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

function extractBrief(html: string): string {
  const $ = load(html);
  const $brief = $("#brief");
  if (!$brief.length) return "";
  let goal = "";
  let what = "";
  let why = "";
  $brief.find("dt").each((_, el) => {
    const label = $(el).text().trim();
    const value = $(el).next("dd").text().trim();
    if (label === "Goal") goal = value;
    else if (label === "What to do") what = value;
    else if (label === "Why it's important") why = value;
  });
  if (what) return `${what}${why ? ` So that: ${why}` : ""}`.trim();
  const dds = $brief.find("dd").map((_, el) => $(el).text().trim()).get();
  return dds.join(" ") || "";
}

interface ScMeta {
  designSystem: string[];
  componentImpacts: string[];
}

const SC_META: Record<string, ScMeta> = {
  "non-text-content": {
    designSystem: [
      "Document alt text and icon meaning in component specs.",
      "Provide default accessible names for icon-only buttons and controls.",
    ],
    componentImpacts: ["Buttons", "Icons", "Images", "Decorative images"],
  },
  "audio-only-and-video-only-prerecorded": {
    designSystem: [
      "If components embed media, ensure text/transcript alternatives are supported.",
    ],
    componentImpacts: ["Media players", "Audio/video embeds"],
  },
  "captions-prerecorded": {
    designSystem: [
      "Media components must support captions or document caption requirements.",
    ],
    componentImpacts: ["Video player", "Synchronized media"],
  },
  "audio-description-or-media-alternative-prerecorded": {
    designSystem: [
      "Document need for audio description or full-text alternative for video.",
    ],
    componentImpacts: ["Video player", "Synchronized media"],
  },
  "captions-live": {
    designSystem: ["Live media components should support real-time captions."],
    componentImpacts: ["Live stream player", "Webinar/meeting UI"],
  },
  "audio-description-prerecorded": {
    designSystem: [
      "Video components should support audio description or extended description.",
    ],
    componentImpacts: ["Video player"],
  },
  "info-and-relationships": {
    designSystem: [
      "Use semantic HTML and ARIA so structure is programmatic.",
      "Document heading levels, list types, form associations in design tokens.",
    ],
    componentImpacts: ["Forms", "Headings", "Tables", "Lists", "Labels"],
  },
  "meaningful-sequence": {
    designSystem: [
      "DOM order must match visual order; avoid order-dependent layout only.",
    ],
    componentImpacts: ["Layouts", "Grids", "Reading order"],
  },
  "sensory-characteristics": {
    designSystem: [
      "Don’t rely only on shape, size, position, or sound for instructions.",
    ],
    componentImpacts: ["Forms", "Instructions", "Error messages"],
  },
  orientation: {
    designSystem: [
      "Support both portrait and landscape; don’t lock to one orientation.",
    ],
    componentImpacts: ["Layouts", "Modals", "Full-screen views"],
  },
  "identify-input-purpose": {
    designSystem: [
      "Document autocomplete values for form fields; use correct input types.",
    ],
    componentImpacts: ["Forms", "Inputs", "Authentication flows"],
  },
  "use-of-color": {
    designSystem: [
      "Color must not be the only way to convey information; add icons or text.",
    ],
    componentImpacts: ["Buttons", "Links", "Status indicators", "Charts"],
  },
  "audio-control": {
    designSystem: [
      "Auto-playing audio must have a control to pause/stop; document in specs.",
    ],
    componentImpacts: ["Media player", "Carousel", "Notifications"],
  },
  "contrast-minimum": {
    designSystem: [
      "Define and enforce minimum contrast in design tokens (4.5:1 text, 3:1 large).",
    ],
    componentImpacts: ["Typography", "Buttons", "Links", "Form labels"],
  },
  "resize-text": {
    designSystem: [
      "Use relative units and allow zoom; avoid fixed px for body text.",
    ],
    componentImpacts: ["Typography", "Layouts", "Modals"],
  },
  "images-of-text": {
    designSystem: [
      "Prefer real text over images of text; document when image-of-text is allowed.",
    ],
    componentImpacts: ["Headings", "Logos", "Decorative text"],
  },
  reflow: {
    designSystem: [
      "Layouts must reflow at 320px width without horizontal scroll; test at 400% zoom.",
    ],
    componentImpacts: ["Layouts", "Modals", "Tables", "Focus states"],
  },
  "non-text-contrast": {
    designSystem: [
      "UI components and graphics must have 3:1 contrast against adjacent colors.",
    ],
    componentImpacts: ["Buttons", "Form controls", "Icons", "Focus indicators"],
  },
  "text-spacing": {
    designSystem: [
      "Don’t prevent users from overriding line height, paragraph spacing, letter/word spacing.",
    ],
    componentImpacts: ["Typography", "Cards", "Blocks of text"],
  },
  "content-on-hover-or-focus": {
    designSystem: [
      "Dismissable on blur; don’t require hover; allow pointer users to move to content.",
    ],
    componentImpacts: ["Tooltips", "Popovers", "Dropdowns", "Modals"],
  },
  keyboard: {
    designSystem: [
      "All interactive components must be keyboard operable; document key behavior.",
    ],
    componentImpacts: ["Buttons", "Links", "Forms", "Modals", "Drag-and-drop"],
  },
  "no-keyboard-trap": {
    designSystem: [
      "Focus must be escapable (e.g. Tab) from modals, menus, and custom widgets.",
    ],
    componentImpacts: ["Modals", "Dialogs", "Menus", "Lightboxes"],
  },
  "character-key-shortcuts": {
    designSystem: [
      "Single-key shortcuts must be toggleable, remappable, or active only when focused.",
    ],
    componentImpacts: ["Editors", "Data grids", "Shortcut-driven UI"],
  },
  "timing-adjustable": {
    designSystem: [
      "Time limits must be configurable or extendable; document in component specs.",
    ],
    componentImpacts: ["Forms", "Session timeout", "Carousel auto-advance"],
  },
  "pause-stop-hide": {
    designSystem: [
      "Auto-updating content must be pausable, stoppable, or hideable.",
    ],
    componentImpacts: ["Carousels", "Marquees", "Live regions", "Notifications"],
  },
  "three-flashes-or-below-threshold": {
    designSystem: [
      "Avoid content that flashes more than 3 times per second; document flash limits.",
    ],
    componentImpacts: ["Animations", "Ads", "Alerts"],
  },
  "bypass-blocks": {
    designSystem: [
      "Provide skip links or landmarks so repeated blocks can be bypassed.",
    ],
    componentImpacts: ["Navigation", "Page template", "Headers"],
  },
  "page-titled": {
    designSystem: [
      "Document page title pattern; ensure unique, descriptive titles.",
    ],
    componentImpacts: ["App shell", "Page template"],
  },
  "focus-order": {
    designSystem: [
      "Focus order must match visual order; avoid positive tabindex; document order.",
    ],
    componentImpacts: ["Modals", "Forms", "Layouts", "Dynamic content"],
  },
  "link-purpose-in-context": {
    designSystem: [
      "Link text (or accessible name) must describe purpose; avoid “click here”.",
    ],
    componentImpacts: ["Links", "Cards", "Buttons that navigate"],
  },
  "multiple-ways": {
    designSystem: [
      "Sites should offer multiple ways to find content (nav, search, sitemap).",
    ],
    componentImpacts: ["Navigation", "Search", "Site structure"],
  },
  "headings-and-labels": {
    designSystem: [
      "Use descriptive headings and labels; document in content guidelines.",
    ],
    componentImpacts: ["Forms", "Headings", "Sections", "Tables"],
  },
  "focus-visible": {
    designSystem: [
      "Define visible focus indicator in design tokens; ensure 3:1 contrast and visibility.",
    ],
    componentImpacts: ["Buttons", "Links", "Form controls", "Focus states"],
  },
  "link-purpose-link-only": {
    designSystem: [
      "Link purpose must be determinable from link text alone (or accessible name).",
    ],
    componentImpacts: ["Links", "Link lists", "Cards"],
  },
  "section-headings": {
    designSystem: [
      "Use heading hierarchy (h1–h6) for structure; document in page templates.",
    ],
    componentImpacts: ["Page layout", "Headings", "Sections"],
  },
  "focus-not-obscured-minimum": {
    designSystem: [
      "Sticky/fixed UI must not fully cover focused component; use scroll-padding or layout.",
    ],
    componentImpacts: ["Modals", "Sticky headers/footers", "Focus states"],
  },
  "pointer-gestures": {
    designSystem: [
      "Multi-point or path-based gestures must have single-pointer alternatives.",
    ],
    componentImpacts: ["Carousels", "Drag-and-drop", "Maps", "Charts"],
  },
  "pointer-cancellation": {
    designSystem: [
      "Activation on up-event (or allow cancel before commit); avoid down-event only.",
    ],
    componentImpacts: ["Buttons", "Links", "Drag-and-drop", "Touch targets"],
  },
  "label-in-name": {
    designSystem: [
      "Visible label text must be included in the accessible name (e.g. aria-label, content).",
    ],
    componentImpacts: ["Buttons", "Links", "Form controls", "Icon buttons"],
  },
  "motion-actuation": {
    designSystem: [
      "Device motion (e.g. shake) must have a UI alternative.",
    ],
    componentImpacts: ["Motion-controlled features", "Alternative controls"],
  },
  "dragging-movements": {
    designSystem: [
      "Dragging must have a non-drag alternative (e.g. arrow keys, click to move).",
    ],
    componentImpacts: ["Drag-and-drop", "Sliders", "Reorderable lists"],
  },
  "target-size-minimum": {
    designSystem: [
      "Touch targets at least 24×24 CSS pixels, or spaced so 24px circle doesn’t overlap another.",
    ],
    componentImpacts: ["Buttons", "Links", "Form controls", "Icon buttons"],
  },
  "language-of-page": {
    designSystem: ["Set lang on html; document in app shell."],
    componentImpacts: ["Page template", "App shell"],
  },
  "language-of-parts": {
    designSystem: [
      "Use lang attribute on content in a different language.",
    ],
    componentImpacts: ["Typography", "Content blocks", "Quotes"],
  },
  "on-focus": {
    designSystem: [
      "Don’t change context (e.g. submit, navigate) on focus alone.",
    ],
    componentImpacts: ["Forms", "Links", "Dropdowns"],
  },
  "on-input": {
    designSystem: [
      "Don’t auto-submit or change context on input alone; use explicit submit.",
    ],
    componentImpacts: ["Forms", "Selects", "Search", "Dropdowns"],
  },
  "consistent-navigation": {
    designSystem: [
      "Repeated nav components should appear in the same order across pages.",
    ],
    componentImpacts: ["Navigation", "Headers", "Sidebars"],
  },
  "consistent-identification": {
    designSystem: [
      "Same functionality should use same component/icon/label across the system.",
    ],
    componentImpacts: ["Buttons", "Icons", "Links", "Components"],
  },
  "change-on-request": {
    designSystem: [
      "Context changes (e.g. new window, focus move) only on user action, not automatically.",
    ],
    componentImpacts: ["Links", "Forms", "Modals", "Dropdowns"],
  },
  "consistent-help": {
    designSystem: [
      "If help (contact, FAQ, etc.) appears on multiple pages, place it in the same relative order.",
    ],
    componentImpacts: ["Help link", "Contact", "Footer", "Navigation"],
  },
  "error-identification": {
    designSystem: [
      "Errors must be clearly identified and described; use programmatic association.",
    ],
    componentImpacts: ["Forms", "Error messages", "Validation"],
  },
  "labels-or-instructions": {
    designSystem: [
      "Provide labels or instructions for inputs; document in component docs.",
    ],
    componentImpacts: ["Forms", "Inputs", "Buttons", "Required fields"],
  },
  "error-suggestion": {
    designSystem: [
      "Where possible, suggest corrections for input errors.",
    ],
    componentImpacts: ["Forms", "Validation", "Error messages"],
  },
  "error-prevention-legal-financial-data": {
    designSystem: [
      "Reversible submissions, confirmations, or review before commit for legal/financial actions.",
    ],
    componentImpacts: ["Forms", "Checkout", "Authentication", "Modals"],
  },
  help: {
    designSystem: [
      "Context-sensitive help should be available for complex inputs.",
    ],
    componentImpacts: ["Forms", "Help text", "Tooltips"],
  },
  "error-prevention-all": {
    designSystem: [
      "For critical submissions, allow review, confirmation, or undo.",
    ],
    componentImpacts: ["Forms", "Submit flows", "Modals"],
  },
  "redundant-entry": {
    designSystem: [
      "Don’t require re-entry of same info in the same process; autocomplete or reuse.",
    ],
    componentImpacts: ["Forms", "Multi-step flows", "Authentication"],
  },
  "accessible-authentication-minimum": {
    designSystem: [
      "Cognitive function tests (e.g. puzzle, memorization) must have an alternative (e.g. object recognition, copy-paste from manager).",
    ],
    componentImpacts: ["Login", "CAPTCHA", "Authentication flows"],
  },
  "name-role-value": {
    designSystem: [
      "All UI components must have name and role; document in component API.",
    ],
    componentImpacts: ["Buttons", "Forms", "Custom widgets", "Modals"],
  },
  "status-messages": {
    designSystem: [
      "Use appropriate live regions (e.g. role=status, role=alert) for status updates.",
    ],
    componentImpacts: ["Toasts", "Alerts", "Form validation", "Loading states"],
  },
};

function getScMeta(id: string): ScMeta {
  const meta = SC_META[id];
  if (meta) return meta;
  return {
    designSystem: ["Document and test this criterion in component specs."],
    componentImpacts: ["Relevant components"],
  };
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
    "# WCAG 2.2 Level A and AA Design System Reference",
    "",
    "This document is intended to be uploaded into a custom GPT Knowledge section and used for generating accessibility decision reports. It summarizes each WCAG 2.2 Level A and AA success criterion in plain language, with design-system relevance and common component impacts. Entries are concise and scannable.",
    "",
  ];

  const briefs = await Promise.all(
    scList.map(async (sc) => {
      try {
        const html = await readFile(`understanding/${sc.version}/${sc.id}.html`, "utf8");
        return extractBrief(html);
      } catch {
        return "";
      }
    })
  );

  for (let i = 0; i < scList.length; i++) {
    const sc = scList[i];
    const brief = briefs[i];
    const meta = getScMeta(sc.id);
    const sourceUrl = `${GITHUB_BASE}/${sc.version}/${sc.id}.html`;
    const understandingUrl = `https://github.com/w3c/wcag/blob/main/understanding/${sc.version}/${sc.id}.html`;

    lines.push(`## ${sc.num} ${sc.name}`);
    lines.push("");
    lines.push(`- **Requirement:** ${brief || "See Understanding document for full requirement."}`);
    lines.push("- **Why this matters for design systems:**");
    for (const b of meta.designSystem) lines.push(`  - ${b}`);
    lines.push("- **Common component impacts:** " + meta.componentImpacts.join(", "));
    lines.push(`- **Source:** [guidelines/sc/${sc.version}/${sc.id}.html](${sourceUrl})`);
    lines.push(`- **Understanding:** [understanding/${sc.version}/${sc.id}.html](${understandingUrl})`);
    lines.push("");
  }

  await writeFile(
    "WCAG_2.2_AA_Design_System_Reference.md",
    lines.join("\n"),
    "utf8"
  );
  console.log("Wrote WCAG_2.2_AA_Design_System_Reference.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
