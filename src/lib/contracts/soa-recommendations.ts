import { STANDARD_ALLOWANCE_CATEGORIES } from "./contracts";

export type SoaRecommendation = {
  id: string;
  type: "CATEGORY_SUGGESTION" | "MISSING_AMOUNT" | "DUPLICATE_ITEM" | "MISSING_DEADLINE" | "SANITY_CHECK";
  severity: "INFO" | "WARNING" | "SUGGESTION";
  itemId?: string;
  category?: string;
  message: string;
  suggestedValue?: string | number;
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Flooring: ["floor", "hardwood", "laminate", "carpet", "vinyl", "lvt", "plank", "underlay"],
  "Kitchen Cabinetry": ["kitchen cabinet", "island cabinet", "pantry", "vanity kitchen", "spice kitchen", "cabinetry"],
  "Bathrooms & Laundry Cabinetry": ["bathroom vanity", "ensuite vanity", "laundry cabinet", "powder room vanity"],
  Countertops: ["quartz", "granite", "countertop", "marble", "island top", "waterfall"],
  "Plumbing Fixtures": ["sink", "faucet", "shower", "toilet", "tub", "plumbing", "drain", "freestanding tub"],
  "Lighting Fixtures": ["light", "chandelier", "pot light", "sconce", "pendant", "led", "fixtures lighting"],
  Appliances: ["fridge", "stove", "dishwasher", "microwave", "oven", "range", "cooktop", "hood fan", "refrigerator"],
  "Tile & Backsplash": ["tile", "backsplash", "porcelain", "grout", "wall tile", "subway"],
  "Fireplace & Feature Walls": ["fireplace", "mantel", "hearth", "slat wall", "feature wall", "shiplap"],
  "Finishing Carpentry & Hardware": ["door", "trim", "baseboard", "casing", "handle", "hardware", "lockset", "railing"],
  "Window Coverings": ["blinds", "shades", "curtains", "drapery", "roller"],
  "Paint & Specialty Finishes": ["paint", "primer", "stain", "accent wall finish"],
  "Landscaping & Exterior": ["lawn", "sod", "deck", "fence", "concrete patio", "driveway", "trees", "shrubs"],
};

/**
 * Detects the most likely standard allowance category based on item title or description.
 */
export function suggestAllowanceCategory(itemName: string, description?: string): string | null {
  const hay = `${itemName} ${description || ""}`.toLowerCase();

  let bestMatch: string | null = null;
  let maxScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (hay.includes(kw)) {
        score += kw.length;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestMatch = category;
    }
  }

  return bestMatch;
}

/**
 * Analyzes Schedule of Allowances items and produces intelligent suggestions.
 * Never invents amounts automatically; always flags them for human review.
 */
export function analyzeSoaItems(
  items: Array<{
    id: string;
    category: string;
    name: string;
    description?: string | null;
    amount: number;
    selectionDueDate?: Date | string | null;
  }>
): SoaRecommendation[] {
  const recommendations: SoaRecommendation[] = [];

  // 1. Check for missing amounts or zero amounts
  for (const item of items) {
    if (!item.amount || item.amount <= 0) {
      recommendations.push({
        id: `missing-amount-${item.id}`,
        type: "MISSING_AMOUNT",
        severity: "WARNING",
        itemId: item.id,
        category: item.category,
        message: `"${item.name}" has no budgeted allowance amount ($0.00).`,
      });
    }

    // 2. Suggest category improvement if current category is generic or misaligned
    if (
      item.category.toLowerCase() === "other" ||
      item.category.toLowerCase() === "general" ||
      !(STANDARD_ALLOWANCE_CATEGORIES as readonly string[]).includes(
        item.category
      )
    ) {
      const suggested = suggestAllowanceCategory(item.name, item.description ?? "");
      if (suggested && suggested !== item.category) {
        recommendations.push({
          id: `suggest-cat-${item.id}`,
          type: "CATEGORY_SUGGESTION",
          severity: "SUGGESTION",
          itemId: item.id,
          category: item.category,
          message: `Consider classifying "${item.name}" under "${suggested}".`,
          suggestedValue: suggested,
        });
      }
    }

    // 3. Flag missing selection due dates
    if (!item.selectionDueDate) {
      recommendations.push({
        id: `missing-date-${item.id}`,
        type: "MISSING_DEADLINE",
        severity: "INFO",
        itemId: item.id,
        category: item.category,
        message: `"${item.name}" does not have a selection deadline set. Setting deadlines ensures PM schedule integration.`,
      });
    }
  }

  // 4. Duplicate item detection
  const seenNames = new Map<string, string>();
  for (const item of items) {
    const key = `${item.category.toLowerCase()}::${item.name.toLowerCase().trim()}`;
    if (seenNames.has(key)) {
      recommendations.push({
        id: `dup-${item.id}`,
        type: "DUPLICATE_ITEM",
        severity: "WARNING",
        itemId: item.id,
        category: item.category,
        message: `Duplicate allowance detected: "${item.name}" in category "${item.category}".`,
      });
    } else {
      seenNames.set(key, item.id);
    }
  }

  // 5. Sanity check: Check for essential missing categories (e.g. no Kitchen Cabinetry or no Flooring)
  const presentCategories = new Set(items.map((i) => i.category.toLowerCase().trim()));
  const essentials = ["flooring", "kitchen cabinetry", "plumbing fixtures", "appliances"];
  for (const essential of essentials) {
    if (!presentCategories.has(essential)) {
      const formatted = essential
        .split(" ")
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ");
      recommendations.push({
        id: `missing-essential-${essential}`,
        type: "SANITY_CHECK",
        severity: "INFO",
        message: `Standard custom home allowance "${formatted}" is not yet included in this SOA.`,
        suggestedValue: formatted,
      });
    }
  }

  return recommendations;
}
