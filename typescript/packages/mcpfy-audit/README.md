<div align="center">

# mcpfy-audit

**Audit any MCP server. Score out of 100. Know what to fix.**

```bash
npx mcpfy-audit https://your-server.com/mcp
```

No account. No signup. Nothing is uploaded.

[![npm](https://img.shields.io/npm/v/mcpfy-audit?label=npm)](https://www.npmjs.com/package/mcpfy-audit)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

</div>

---

## What it does

Connects to an MCP server, reads what it advertises, and scores it on twelve
checks across protocol conformance, schema quality, description quality and
safety.

```
  mcpfy audit  https://example.com/mcp
  customer-mcp 1.2.0 · 2025-06-18

  91 / 100  ready   10 of 12 checks pass
  █████████████████████████████░░░

  ! Arguments are described  [important]
    1 tools have undescribed arguments.
    search_customers (query, limit)
    An undescribed argument is one the model has to infer from its name.
    Say what goes in it, and give an example where the format is not obvious.
```

Every failure names the tools it applies to and says what to do about it.

## Why it matters

An agent picks a tool by reading its description, and fills in arguments by
reading theirs. A tool that works perfectly and describes itself badly will
simply not be chosen — which looks, from the outside, exactly like a tool that
is broken.

Most MCP servers ship with at least one of these problems. They are cheap to
fix and almost never noticed, because nothing tells you.

## Usage

```bash
# An HTTP endpoint
npx mcpfy-audit https://example.com/mcp

# A local server over stdio — what most MCP servers actually are
npx mcpfy-audit --command "node dist/server.js"

# Behind auth
npx mcpfy-audit https://example.com/mcp --token "$API_KEY"
npx mcpfy-audit https://example.com/mcp --header "X-Api-Key: $KEY"
```

### In CI

```yaml
- run: npx mcpfy-audit --command "node dist/server.js" --min-score 85
```

| Exit code | Meaning |
| --- | --- |
| `0` | No blocking failures |
| `1` | Score below `--min-score` |
| `2` | A blocking check failed |
| `3` | The audit could not run at all |

Advisories never fail a build. `--json` gives the full report for your own
tooling.

## What is checked

**Protocol** — completes an MCP handshake, advertises at least one tool,
negotiates a dated protocol version.

**Descriptions** — every tool described, descriptions that say something
rather than restate the name, every argument described.

**Schemas** — arguments declared, required arguments marked required, output
schemas present, names in a consistent convention.

**Safety** — tools whose names suggest they delete things carry a
`destructiveHint`, and nothing key-shaped appears in metadata that is sent to
every client that connects.

### What it cannot check

Whether your tools actually work. A single handshake cannot tell you that a
tool fails one call in five, or that half your surface area has never been
called by anything — that needs traffic, over time.

[MCPfy](https://github.com/mcpfyy/mcpfy) scores those too, from requests
through its gateway. This tool is the half that works standalone, and it is
the half most servers fail.

## Scoring

Checks are weighted by severity rather than counted, so a dozen cosmetic wins
cannot outweigh one serious failure. A failed **blocker** caps the score below
50 — a server that cannot be connected to is not "82% ready".

## License

MIT. Part of [mcpfy](https://github.com/mcpfyy/mcpfy).
