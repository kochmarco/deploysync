#!/usr/bin/env node
/**
 * DeploySync — MCP Stdio Adapter
 *
 * Standalone MCP server that communicates via stdio (JSON-RPC 2.0)
 * and bridges tool calls to the DeploySync REST API running locally.
 *
 * Usage:
 *   node mcp-stdio-adapter.js [--port 3500]
 *
 * This file is auto-copied to userData by the Electron app.
 * Editors (Cursor, Claude Code, VS Code, Windsurf) launch it as a subprocess.
 */

const { createInterface } = require("readline");
const http = require("http");

// ─── Config ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const portIdx = args.indexOf("--port");
const API_PORT = portIdx >= 0 && args[portIdx + 1] ? parseInt(args[portIdx + 1]) : 3500;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

// ─── Tool Definitions ────────────────────────────────────────
const TOOLS = [
  {
    name: "notify_file_change",
    description:
      "Notify DeploySync that a file has been created, modified, or deleted. " +
      "Call this after making changes to project files so the developer can review and deploy them.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Relative path of the changed file (e.g. 'app/Http/Controllers/UserController.php')",
        },
        changeType: {
          type: "string",
          enum: ["created", "modified", "deleted"],
          description: "Type of change made to the file",
        },
        description: {
          type: "string",
          description: "Brief description of what was changed and why",
        },
        agent: {
          type: "string",
          description: "Name of the editor/agent making the change (e.g. 'cursor', 'claude-code', 'windsurf')",
        },
      },
      required: ["filePath", "changeType"],
    },
  },
  {
    name: "notify_batch_changes",
    description:
      "Notify DeploySync about multiple file changes at once. " +
      "Use this when you've modified several files in a single operation.",
    inputSchema: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filePath: { type: "string", description: "Relative path of the changed file" },
              changeType: { type: "string", enum: ["created", "modified", "deleted"] },
              description: { type: "string", description: "Brief description of the change" },
            },
            required: ["filePath", "changeType"],
          },
          description: "Array of file changes",
        },
      },
      required: ["changes"],
    },
  },
  {
    name: "get_changed_files",
    description:
      "Get the list of currently tracked file changes in DeploySync. " +
      "Useful to check which files are pending for deploy.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_deploy_status",
    description:
      "Check DeploySync connection status, active project info, and server health.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ─── HTTP Helper ─────────────────────────────────────────────
function httpRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { "Content-Type": "application/json" },
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: { raw: data } });
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout")); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Tool Handlers ───────────────────────────────────────────
async function handleToolCall(name, args) {
  try {
    if (name === "notify_file_change") {
      const res = await httpRequest("POST", "/api/notify", {
        filePath: args.filePath,
        changeType: args.changeType,
        description: args.description || null,
        agent: args.agent || "mcp-stdio",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
      };
    }

    if (name === "notify_batch_changes") {
      const res = await httpRequest("POST", "/mcp/execute", {
        tool: "notify_batch_changes",
        arguments: {
          changes: args.changes,
          agent: "mcp-stdio",
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
      };
    }

    if (name === "get_changed_files") {
      // Hit the health endpoint for basic info
      const res = await httpRequest("GET", "/health");
      return {
        content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
      };
    }

    if (name === "get_deploy_status") {
      const res = await httpRequest("GET", "/health");
      return {
        content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
      };
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: `DeploySync is not running or not reachable at ${API_BASE}. Error: ${err.message}`,
      }],
      isError: true,
    };
  }
}

// ─── JSON-RPC Protocol ──────────────────────────────────────
function send(msg) {
  const json = JSON.stringify(msg);
  process.stdout.write(json + "\n");
}

function makeResponse(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function makeError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMessage(msg) {
  // Notifications (no id) — no response needed
  if (!("id" in msg)) return;

  const { id, method, params } = msg;

  if (method === "initialize") {
    send(makeResponse(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "deploysync-mcp", version: "1.0.0" },
    }));
    return;
  }

  if (method === "ping") {
    send(makeResponse(id, {}));
    return;
  }

  if (method === "tools/list") {
    send(makeResponse(id, { tools: TOOLS }));
    return;
  }

  if (method === "tools/call") {
    const result = await handleToolCall(params.name, params.arguments || {});
    send(makeResponse(id, result));
    return;
  }

  // Unknown method
  send(makeError(id, -32601, `Method not found: ${method}`));
}

// ─── Stdin Reader ───────────────────────────────────────────
const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    await handleMessage(msg);
  } catch (err) {
    console.error("[DeploySync MCP] Parse error:", err.message);
    send(makeError(null, -32700, "Parse error"));
  }
});

// Graceful shutdown
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

console.error(`[DeploySync MCP] Stdio adapter started (API: ${API_BASE})`);
