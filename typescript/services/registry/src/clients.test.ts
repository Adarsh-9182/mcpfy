import { test } from "node:test";
import assert from "node:assert/strict";
import { allRecipes, configKey, KEY_PLACEHOLDER, recipeFor, CLIENTS } from "./clients";

const TARGET = { name: "Customer MCP", endpoint: "https://mcpfy.dev/g/acme/customer-mcp/mcp" };

test("no recipe ever contains a real credential", () => {
  // These snippets get pasted into chats and committed to git.
  for (const { recipe } of allRecipes(TARGET)) {
    const text = JSON.stringify(recipe);
    assert.ok(!/sk_|Bearer\s+[A-Za-z0-9]{16,}/.test(text), `leaked in ${text}`);
  }
});

test("every client in the list produces a recipe", () => {
  const recipes = allRecipes(TARGET);
  assert.equal(recipes.length, CLIENTS.length);
  for (const { id, recipe } of recipes) {
    assert.ok(["file", "command", "manual"].includes(recipe.kind), `${id} had kind ${recipe.kind}`);
  }
});

test("ChatGPT is a manual recipe, because it has no config file", () => {
  const recipe = recipeFor("chatgpt", TARGET);
  assert.equal(recipe.kind, "manual");
  if (recipe.kind === "manual") {
    assert.ok(recipe.steps.some((s) => s.includes(TARGET.endpoint)));
  }
});

test("VS Code nests under `servers`, the others under `mcpServers`", () => {
  const vscode = recipeFor("vscode", TARGET);
  assert.equal(vscode.kind, "file");
  if (vscode.kind === "file") {
    const parsed = JSON.parse(vscode.code);
    assert.ok(parsed.servers, "VS Code uses `servers`");
    assert.equal(parsed.mcpServers, undefined);
  }

  for (const id of ["claude-desktop", "cursor", "gemini"] as const) {
    const recipe = recipeFor(id, TARGET);
    if (recipe.kind === "file") {
      assert.ok(JSON.parse(recipe.code).mcpServers, `${id} uses mcpServers`);
    }
  }
});

test("Gemini uses httpUrl, since `url` means SSE there", () => {
  const recipe = recipeFor("gemini", TARGET);
  if (recipe.kind === "file") {
    const entry = JSON.parse(recipe.code).mcpServers["customer-mcp"];
    assert.ok(entry.httpUrl, "expected httpUrl");
    assert.equal(entry.url, undefined);
  }
});

test("every generated file is valid JSON", () => {
  for (const { id, recipe } of allRecipes(TARGET)) {
    if (recipe.kind === "file") {
      assert.doesNotThrow(() => JSON.parse(recipe.code), `${id} produced invalid JSON`);
    }
  }
});

test("an unauthenticated server gets no Authorization header", () => {
  const open = { ...TARGET, authenticated: false };
  for (const { recipe } of allRecipes(open)) {
    if (recipe.kind === "file") {
      assert.ok(!recipe.code.includes("Authorization"), recipe.code);
    }
    if (recipe.kind === "command") {
      assert.ok(!recipe.code.includes("Authorization"));
    }
  }
});

test("the placeholder is what appears where a key would go", () => {
  const recipe = recipeFor("claude-desktop", TARGET);
  if (recipe.kind === "file") assert.ok(recipe.code.includes(KEY_PLACEHOLDER));
});

test("config keys are safe identifiers", () => {
  assert.equal(configKey("Customer MCP"), "customer-mcp");
  assert.equal(configKey("  Weird / Name!  "), "weird-name");
  assert.equal(configKey("!!!"), "mcpfy-server");
});
