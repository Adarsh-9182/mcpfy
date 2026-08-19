"use client";

import * as React from "react";
import { cn } from "@mcpfy/ui";

/**
 * §6 — the hero's product visualization: a live network rather than a picture
 * of one.
 *
 * MCPfy sits between agents and the systems they reach, so the diagram is
 * literally that shape. Pulses travel the connections continuously because
 * the claim being made is about traffic, and a static diagram of a gateway
 * says nothing a sentence could not.
 *
 * Motion is SMIL (`animateMotion`) rather than CSS `offset-path`: the pulse
 * has to follow the exact same curve the line is drawn from, and referencing
 * the path by id removes the chance of the two drifting apart when the
 * geometry changes.
 */

interface Node {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  /** Whether this node calls MCPfy, or MCPfy calls it. Sets pulse direction. */
  direction: "inbound" | "outbound";
  detail: { method: string; target: string; ms: number };
}

const CENTER = { x: 400, y: 230 };

const NODES: Node[] = [
  {
    id: "claude",
    label: "Claude",
    sub: "client",
    x: 152,
    y: 78,
    direction: "inbound",
    detail: { method: "tools/call", target: "search_customers", ms: 42 },
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    sub: "client",
    x: 118,
    y: 236,
    direction: "inbound",
    detail: { method: "tools/list", target: "customer-mcp", ms: 18 },
  },
  {
    id: "agents",
    label: "AI agents",
    sub: "custom",
    x: 156,
    y: 384,
    direction: "inbound",
    detail: { method: "initialize", target: "handshake", ms: 26 },
  },
  {
    id: "apis",
    label: "Your APIs",
    sub: "upstream",
    x: 648,
    y: 78,
    direction: "outbound",
    detail: { method: "GET", target: "/v1/customers", ms: 81 },
  },
  {
    id: "servers",
    label: "MCP servers",
    sub: "deployed",
    x: 682,
    y: 236,
    direction: "outbound",
    detail: { method: "tools/call", target: "4 tools", ms: 46 },
  },
  {
    id: "apps",
    label: "MCP Apps",
    sub: "widgets",
    x: 644,
    y: 384,
    direction: "outbound",
    detail: { method: "resources/read", target: "app://invoice", ms: 33 },
  },
];

/**
 * A curve from a node to the hub.
 *
 * The control point is offset *perpendicular* to the line, not vertically.
 * Offsetting vertically leaves any horizontal connection dead straight — the
 * two middle nodes came out as flat spokes — and straight spokes read as a
 * wiring diagram where the whole point is to read as flow.
 */
function curve(node: Node): string {
  const dx = CENTER.x - node.x;
  const dy = CENTER.y - node.y;
  const length = Math.hypot(dx, dy) || 1;

  // Unit normal, consistently signed so every line bows the same direction
  // around the hub rather than some in and some out.
  const bow = node.y <= CENTER.y ? 1 : -1;
  const nx = (-dy / length) * bow;
  const ny = (dx / length) * bow;

  const bend = length * 0.17;
  const cx = (node.x + CENTER.x) / 2 + nx * bend;
  const cy = (node.y + CENTER.y) / 2 + ny * bend;

  return `M ${node.x} ${node.y} Q ${cx} ${cy} ${CENTER.x} ${CENTER.y}`;
}

/**
 * One floating card, not three.
 *
 * The others were positioned in percentages and collided as soon as the
 * column narrowed — percent positioning over a responsive diagram cannot be
 * made safe at every width. The live readout moved to a strip underneath,
 * where it cannot overlap anything and is legible on a phone.
 */
const ENDPOINT_CARD = {
  title: "Gateway endpoint",
  value: "/g/acme/customer-mcp/mcp",
};

export function NetworkDiagram() {
  const [active, setActive] = React.useState<string | null>(null);
  const [animate, setAnimate] = React.useState(false);

  // Motion is opt-in after mount: it keeps the first paint cheap, and it lets
  // a reduced-motion reader get the diagram without the movement.
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!query.matches);
    const onChange = () => setAnimate(!query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const shown = NODES.find((n) => n.id === active) ?? null;

  return (
    <div
      className="relative w-full pt-14 sm:pt-16"
      onMouseLeave={() => setActive(null)}
      aria-label="MCPfy routes requests between AI clients and the systems they reach"
    >
      <svg
        viewBox="0 0 800 460"
        className="w-full"
        role="img"
        aria-hidden="true"
      >
        <defs>
          {/* One soft bloom, reused. Filters are expensive; six would show. */}
          <filter id="net-glow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <radialGradient id="net-hub">
            <stop offset="0%" stopColor="var(--violet-300)" />
            <stop offset="100%" stopColor="var(--violet-500)" />
          </radialGradient>

          <radialGradient id="net-halo">
            <stop offset="0%" stopColor="var(--violet-500)" stopOpacity="0.30" />
            <stop offset="70%" stopColor="var(--violet-500)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--violet-500)" stopOpacity="0" />
          </radialGradient>

          {NODES.map((node) => (
            <path key={node.id} id={`net-path-${node.id}`} d={curve(node)} />
          ))}
        </defs>

        <circle cx={CENTER.x} cy={CENTER.y} r="150" fill="url(#net-halo)" />

        {/* Connections */}
        <g fill="none" strokeLinecap="round">
          {NODES.map((node) => {
            const lit = active === null || active === node.id;
            return (
              <use
                key={node.id}
                href={`#net-path-${node.id}`}
                stroke={
                  active === node.id ? "var(--violet-400)" : "var(--border-strong)"
                }
                strokeWidth={active === node.id ? 1.6 : 1}
                opacity={lit ? 1 : 0.25}
                style={{ transition: "opacity 300ms, stroke 300ms, stroke-width 300ms" }}
              />
            );
          })}
        </g>

        {/* Pulses. Direction follows who is calling whom. */}
        {animate ? (
          <g filter="url(#net-glow)">
            {NODES.map((node, i) => {
              const dimmed = active !== null && active !== node.id;
              return (
                <circle
                  key={node.id}
                  r={active === node.id ? 4 : 3}
                  fill={
                    node.direction === "inbound"
                      ? "var(--violet-300)"
                      : "var(--chart-volume)"
                  }
                  opacity={dimmed ? 0.15 : 1}
                  style={{ transition: "opacity 300ms" }}
                >
                  <animateMotion
                    dur={`${active === node.id ? 1.6 : 3.4 + i * 0.24}s`}
                    repeatCount="indefinite"
                    begin={`${i * 0.42}s`}
                    keyPoints={node.direction === "inbound" ? "0;1" : "1;0"}
                    keyTimes="0;1"
                    calcMode="linear"
                  >
                    <mpath href={`#net-path-${node.id}`} />
                  </animateMotion>
                </circle>
              );
            })}
          </g>
        ) : null}

        {/* Hub */}
        <g>
          <circle
            cx={CENTER.x}
            cy={CENTER.y}
            r="52"
            fill="var(--bg-raised)"
            stroke="var(--accent-border)"
            strokeWidth="1"
          />
          <circle
            cx={CENTER.x}
            cy={CENTER.y}
            r="17"
            fill="url(#net-hub)"
            filter="url(#net-glow)"
          />
          <rect
            x={CENTER.x - 5}
            y={CENTER.y - 5}
            width="10"
            height="10"
            rx="2.5"
            fill="var(--violet-950)"
          />
          <text
            x={CENTER.x}
            y={CENTER.y + 38}
            textAnchor="middle"
            className="fill-[var(--text-high)] font-mono"
            fontSize="14"
            fontWeight="500"
          >
            MCPfy
          </text>
        </g>

        {/* Nodes */}
        {NODES.map((node) => {
          const dimmed = active !== null && active !== node.id;
          const onLeft = node.x < CENTER.x;
          return (
            <g
              key={node.id}
              opacity={dimmed ? 0.35 : 1}
              style={{ transition: "opacity 300ms" }}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r="7"
                fill="var(--bg-raised)"
                stroke={
                  active === node.id ? "var(--violet-400)" : "var(--border-strong)"
                }
                strokeWidth="1.5"
                style={{ transition: "stroke 300ms" }}
              />
              <circle
                cx={node.x}
                cy={node.y}
                r="2.5"
                fill={
                  active === node.id ? "var(--violet-300)" : "var(--text-faint)"
                }
                style={{ transition: "fill 300ms" }}
              />
              <text
                x={onLeft ? node.x - 15 : node.x + 15}
                y={node.y - 1}
                textAnchor={onLeft ? "end" : "start"}
                className="fill-[var(--text-default)]"
                fontSize="15"
                fontWeight="500"
              >
                {node.label}
              </text>
              <text
                x={onLeft ? node.x - 15 : node.x + 15}
                y={node.y + 14}
                textAnchor={onLeft ? "end" : "start"}
                className="fill-[var(--text-faint)] font-mono"
                fontSize="12"
              >
                {node.sub}
              </text>
            </g>
          );
        })}
      </svg>

      {/*
        Hit targets are HTML over the SVG rather than SVG elements: they are
        focusable, keyboard-operable and announced, none of which a bare
        <circle> gives you.
      */}
      {NODES.map((node) => (
        <button
          key={node.id}
          type="button"
          onMouseEnter={() => setActive(node.id)}
          onFocus={() => setActive(node.id)}
          onBlur={() => setActive(null)}
          aria-label={`${node.label} — ${node.detail.method} ${node.detail.target}, ${node.detail.ms}ms`}
          className="absolute size-11 -translate-x-1/2 -translate-y-1/2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          style={{
            left: `${(node.x / 800) * 100}%`,
            top: `${(node.y / 460) * 100}%`,
          }}
        />
      ))}

      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-0 top-0 hidden max-w-[14rem] rounded-[var(--radius-lg)]",
          "border border-line bg-[color-mix(in_oklab,var(--bg-raised)_92%,transparent)]",
          "px-3 py-2 shadow-[var(--shadow-panel),var(--edge-highlight)] backdrop-blur-sm sm:block",
        )}
        style={
          animate
            ? { animation: "mcpfy-float 7s ease-in-out infinite" }
            : undefined
        }
      >
        <p className="text-2xs font-medium uppercase tracking-wider text-faint">
          {ENDPOINT_CARD.title}
        </p>
        <code className="mt-1 block truncate font-mono text-2xs text-accent-text">
          {ENDPOINT_CARD.value}
        </code>
      </div>

      {/* The readout. A strip rather than a floating card, so it can never
          land on top of a node label or another card. */}
      <div
        className={cn(
          "mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-lg)] border px-3 py-2",
          "bg-[color-mix(in_oklab,var(--bg-raised)_92%,transparent)] transition-colors",
          shown ? "border-accent-border" : "border-line",
        )}
      >
        <span className="text-2xs font-medium uppercase tracking-wider text-faint">
          {shown ? shown.label : "Hover a node"}
        </span>
        <span className="font-mono text-2xs">
          {shown ? (
            <>
              <span className="text-accent-text">{shown.detail.method}</span>{" "}
              <span className="text-muted">{shown.detail.target}</span>
            </>
          ) : (
            <span className="text-faint">every request authenticated and traced</span>
          )}
        </span>
        <span className="ml-auto font-mono text-2xs tabular-nums text-faint">
          {shown ? `${shown.detail.ms}ms` : "p95 184ms"}
        </span>
      </div>
    </div>
  );
}
