import type { SourceTree } from "./types";

/**
 * A SourceTree over a plain path → contents map.
 *
 * Used by the tests, and by anything that already holds a repository in
 * memory. Directory listings are derived from the paths, so a fixture only
 * has to declare files.
 */
export function memoryTree(files: Record<string, string>): SourceTree {
  const normalise = (p: string) => p.replace(/^\.\//, "").replace(/^\/+/, "");
  const entries = Object.keys(files).map(normalise);

  return {
    async list(directory) {
      const dir = directory === "." || directory === "" ? "" : `${normalise(directory)}/`;
      const names = new Set<string>();
      for (const path of entries) {
        if (!path.startsWith(dir)) continue;
        const rest = path.slice(dir.length);
        if (!rest) continue;
        const [head] = rest.split("/");
        if (head) names.add(head);
      }
      return [...names];
    },
    async read(path) {
      return files[normalise(path)] ?? files[path] ?? null;
    },
  };
}
