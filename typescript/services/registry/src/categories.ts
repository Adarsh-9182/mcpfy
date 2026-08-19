/**
 * §8 — the registry taxonomy.
 *
 * Nine categories, fixed, defined here rather than as free text on the
 * listing. A registry whose categories are user-supplied strings ends up with
 * "CRM", "crm", "Crm" and "Customer Relationship Management" as four separate
 * facets within a week, and the browse-by-category page — the entire point of
 * §8 — stops working.
 *
 * `blurb` is shown under the category name on the registry homepage, because
 * "Data" alone does not tell anyone whether a Postgres connector belongs
 * there or under Infrastructure.
 */

export interface Category {
  readonly id: CategoryId;
  readonly label: string;
  readonly blurb: string;
}

export const CATEGORY_IDS = [
  "development",
  "data",
  "finance",
  "crm",
  "productivity",
  "marketing",
  "research",
  "automation",
  "infrastructure",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export const CATEGORIES: readonly Category[] = [
  {
    id: "development",
    label: "Development",
    blurb: "Repositories, issues, CI and code review.",
  },
  {
    id: "data",
    label: "Data",
    blurb: "Databases, warehouses and analytics engines.",
  },
  {
    id: "finance",
    label: "Finance",
    blurb: "Payments, invoicing, ledgers and reporting.",
  },
  {
    id: "crm",
    label: "CRM",
    blurb: "Customers, pipeline and support desks.",
  },
  {
    id: "productivity",
    label: "Productivity",
    blurb: "Docs, notes, calendars and task trackers.",
  },
  {
    id: "marketing",
    label: "Marketing",
    blurb: "Campaigns, content and audience data.",
  },
  {
    id: "research",
    label: "Research",
    blurb: "Search, scraping, papers and knowledge bases.",
  },
  {
    id: "automation",
    label: "Automation",
    blurb: "Workflows, schedulers and internal tooling.",
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    blurb: "Cloud, containers, observability and networking.",
  },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === "string" && BY_ID.has(value as CategoryId);
}

/** Null rather than a fallback category: an unknown facet must not silently
 *  become "Development" and bury a listing where nobody looks for it. */
export function categoryOf(value: unknown): Category | null {
  return isCategoryId(value) ? (BY_ID.get(value) ?? null) : null;
}

export function categoryLabel(value: unknown): string {
  return categoryOf(value)?.label ?? "Uncategorised";
}
