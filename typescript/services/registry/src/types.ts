import type { CategoryId } from "./categories";

/** The subset of a listing the ranking model reads. Kept narrow so ranking
 *  can be tested without constructing a whole database row. */
export interface RankableListing {
  slug: string;
  installCount: number;
  toolCount: number;
  verified: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  /** MCPfy's measured protocol-conformance score, 0-100, when we host it. */
  readinessScore?: number | null;
}

/** What the registry pages render. */
export interface RegistryListing extends RankableListing {
  id: string;
  name: string;
  summary: string;
  category: CategoryId | string;
  authKind: string;
  /** Present when MCPfy hosts it; absent for an indexed third-party server. */
  serverId: string | null;
  endpointUrl: string | null;
  repositoryUrl: string | null;
  homepageUrl: string | null;
  version: string | null;
  publisher: { name: string; slug: string | null };
}

export type SortMode = "trending" | "installs" | "recent" | "name";

export interface SearchQuery {
  text: string;
  category: CategoryId | null;
  verifiedOnly: boolean;
  sort: SortMode;
}
