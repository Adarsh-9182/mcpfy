import { GITHUB_API, GITHUB_HEADERS, type TokenCache } from "./app-auth";
import type { SourceTree } from "@mcpfy/detection";

/**
 * Reads repositories through an installation token.
 *
 * Everything here is scoped to one installation, which is how GitHub enforces
 * that MCPfy can only see repositories the user actually granted.
 */

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
  private: boolean;
  updatedAt: string;
  language: string | null;
}

export class GitHubClient {
  constructor(
    private readonly tokens: TokenCache,
    private readonly installationId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request(path: string): Promise<Response> {
    const token = await this.tokens.get(this.installationId);
    return this.fetchImpl(`${GITHUB_API}${path}`, {
      headers: { ...GITHUB_HEADERS, authorization: `Bearer ${token}` },
    });
  }

  /** Repositories this installation can see. */
  async listRepositories(): Promise<Repository[]> {
    const repositories: Repository[] = [];

    // Paginate rather than taking the first page: a user with 120 repos
    // would otherwise be told the one they want does not exist.
    for (let page = 1; page <= 10; page++) {
      const response = await this.request(
        `/installation/repositories?per_page=100&page=${page}`,
      );
      if (!response.ok) {
        throw new Error(
          `Could not list repositories (${response.status}). The installation ` +
            `may have been removed.`,
        );
      }

      const body = (await response.json()) as {
        repositories: Record<string, any>[];
      };

      for (const repo of body.repositories ?? []) {
        repositories.push({
          id: String(repo.id),
          name: String(repo.name),
          fullName: String(repo.full_name),
          owner: String(repo.owner?.login ?? ""),
          defaultBranch: String(repo.default_branch ?? "main"),
          private: repo.private === true,
          updatedAt: String(repo.pushed_at ?? repo.updated_at ?? ""),
          language: repo.language ?? null,
        });
      }

      if ((body.repositories ?? []).length < 100) break;
    }

    return repositories.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** A clone URL carrying the installation token, for the build to use. */
  async cloneUrl(fullName: string): Promise<string> {
    const token = await this.tokens.get(this.installationId);
    return `https://x-access-token:${token}@github.com/${fullName}.git`;
  }

  /**
   * A SourceTree backed by the GitHub API.
   *
   * Detection can then run without cloning, which turns "connect a repository"
   * from a ten-second wait into a request or two — and works for repositories
   * far too large to clone on a whim.
   */
  tree(fullName: string, ref: string): SourceTree {
    const contents = async (path: string): Promise<unknown> => {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const response = await this.request(
        `/repos/${fullName}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}${query}`,
      );
      if (!response.ok) return null;
      return response.json();
    };

    return {
      async list(directory) {
        const path = directory === "." ? "" : directory;
        const body = await contents(path);
        if (!Array.isArray(body)) return [];
        return body.map((entry) => String((entry as { name: string }).name));
      },
      async read(path) {
        const body = await contents(path);
        if (!body || Array.isArray(body)) return null;
        const file = body as { content?: string; encoding?: string };
        if (file.encoding !== "base64" || typeof file.content !== "string") {
          return null;
        }
        return Buffer.from(file.content, "base64").toString("utf8");
      },
    };
  }
}
