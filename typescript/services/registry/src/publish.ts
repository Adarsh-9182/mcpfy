import { isCategoryId } from "./categories";
import { checkSlug } from "./slug";

/**
 * §22 — what a listing must satisfy before it can be published.
 *
 * A registry is worth using only if its entries are trustworthy, and the
 * cheapest place to enforce that is the moment of publication. Everything
 * checked here is checked again on the server: this module is shared by the
 * form and the action, so the form can show the problem inline, but the action
 * never trusts that the form ran.
 *
 * Note what is deliberately *not* here: the readiness score. That is measured
 * against a running server by services/readiness, and gating publication on it
 * would mean an indexed third-party listing — one MCPfy does not host and
 * cannot probe — could never be published at all.
 */

export interface ListingDraft {
  name: string;
  slug: string;
  summary: string;
  category: string;
  serverId?: string | null;
  endpointUrl?: string | null;
  repositoryUrl?: string | null;
  homepageUrl?: string | null;
}

export interface Problem {
  field: keyof ListingDraft | "form";
  message: string;
}

export const SUMMARY_MIN = 20;
export const SUMMARY_MAX = 200;
export const NAME_MIN = 2;
export const NAME_MAX = 60;

/**
 * Only http(s), and only absolute.
 *
 * These URLs are rendered as links on a public page. Permitting the javascript:
 * or data: schemes would turn every listing into a stored-XSS vector, so the
 * scheme is checked against an allow-list rather than a deny-list.
 */
export function checkUrl(value: string, field: keyof ListingDraft): Problem | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { field, message: "Must be a full URL, including https://." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { field, message: "Only http and https URLs are allowed." };
  }
  return null;
}

export function validateDraft(draft: ListingDraft): Problem[] {
  const problems: Problem[] = [];

  const name = draft.name.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    problems.push({
      field: "name",
      message: `Between ${NAME_MIN} and ${NAME_MAX} characters.`,
    });
  }

  const slug = checkSlug(draft.slug ?? "");
  if (!slug.ok) problems.push({ field: "slug", message: slug.reason });

  const summary = draft.summary.trim();
  if (summary.length < SUMMARY_MIN || summary.length > SUMMARY_MAX) {
    problems.push({
      field: "summary",
      message: `Between ${SUMMARY_MIN} and ${SUMMARY_MAX} characters — one sentence on what it connects.`,
    });
  }

  if (!isCategoryId(draft.category)) {
    problems.push({ field: "category", message: "Choose one of the registry categories." });
  }

  for (const field of ["endpointUrl", "repositoryUrl", "homepageUrl"] as const) {
    const value = draft[field];
    if (value) {
      const problem = checkUrl(value, field);
      if (problem) problems.push(problem);
    }
  }

  // A listing has to lead somewhere. Without a hosted server, an endpoint or
  // at least a repository, it is an advert rather than an integration.
  if (!draft.serverId && !draft.endpointUrl && !draft.repositoryUrl) {
    problems.push({
      field: "form",
      message:
        "Link the listing to an MCPfy server, or give an endpoint or repository URL.",
    });
  }

  return problems;
}

export function isPublishable(draft: ListingDraft): boolean {
  return validateDraft(draft).length === 0;
}
