const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const http = require("http");
const EventEmitter = require("events");

class MCPServer extends EventEmitter {
  constructor(port = 3500) {
    super();
    this.port = port;
    this.server = null;
    this.wss = null;
    this.connectedAgents = new Map(); // ws -> agentName
  }

  start() {
    const app = express();
    app.use(cors());
    app.use(express.json());

    // ─── MCP Tool Discovery ────────────────────────────────────
    // Standard MCP endpoint: list available tools
    app.get("/mcp/tools", (req, res) => {
      res.json({
        tools: [
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
                  description: "Name of the AI agent (e.g. 'claude-code', 'cursor', 'antigravity')",
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
                      filePath: { type: "string" },
                      changeType: { type: "string", enum: ["created", "modified", "deleted"] },
                      description: { type: "string" },
                    },
                    required: ["filePath", "changeType"],
                  },
                  description: "Array of file changes",
                },
                agent: {
                  type: "string",
                  description: "Name of the AI agent",
                },
              },
              required: ["changes"],
            },
          },
        ],
      });
    });

    // ─── MCP Tool Execution ────────────────────────────────────
    app.post("/mcp/execute", (req, res) => {
      const { tool, arguments: args } = req.body;

      if (tool === "notify_file_change") {
        this.emit("file-notify", {
          filePath: args.filePath,
          changeType: args.changeType || "modified",
          description: args.description || null,
          agent: args.agent || "mcp-agent",
        });

        return res.json({
          success: true,
          message: `File change registered: ${args.filePath}`,
        });
      }

      if (tool === "notify_batch_changes") {
        const changes = args.changes || [];
        const agent = args.agent || "mcp-agent";

        for (const change of changes) {
          this.emit("file-notify", {
            filePath: change.filePath,
            changeType: change.changeType || "modified",
            description: change.description || null,
            agent,
          });
        }

        return res.json({
          success: true,
          message: `${changes.length} file changes registered`,
        });
      }

      res.status(400).json({ error: `Unknown tool: ${tool}` });
    });

    // ─── Simple REST API (alternative to MCP) ──────────────────
    app.post("/api/notify", (req, res) => {
      const { filePath, changeType, description, agent } = req.body;

      if (!filePath) {
        return res.status(400).json({ error: "filePath is required" });
      }

      this.emit("file-notify", {
        filePath,
        changeType: changeType || "modified",
        description: description || null,
        agent: agent || "api",
      });

      res.json({ success: true });
    });

    // Health check
    app.get("/health", (req, res) => {
      res.json({
        status: "ok",
        agents: this.getConnectedAgents(),
        uptime: process.uptime(),
      });
    });

    // ─── HTTP + WebSocket Server ───────────────────────────────
    this.server = http.createServer(app);

    this.wss = new WebSocketServer({ server: this.server, path: "/ws" });

    this.wss.on("connection", (ws) => {
      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type === "register") {
            const agentName = msg.agent || "unknown";
            this.connectedAgents.set(ws, agentName);
            this.emit("agent-connected", agentName);
            ws.send(JSON.stringify({ type: "registered", agent: agentName }));
          }

          if (msg.type === "notify_file_change") {
            this.emit("file-notify", {
              filePath: msg.filePath,
              changeType: msg.changeType || "modified",
              description: msg.description || null,
              agent: this.connectedAgents.get(ws) || msg.agent || "ws-agent",
            });
            ws.send(JSON.stringify({ type: "ack", filePath: msg.filePath }));
          }
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        }
      });

      ws.on("close", () => {
        const agentName = this.connectedAgents.get(ws);
        if (agentName) {
          this.connectedAgents.delete(ws);
          this.emit("agent-disconnected", agentName);
        }
      });
    });

    this.server.listen(this.port, "127.0.0.1", () => {
      console.log(`[MCP] Server running on http://127.0.0.1:${this.port}`);
    });
  }

  stop() {
    if (this.wss) this.wss.close();
    if (this.server) this.server.close();
    this.connectedAgents.clear();
  }

  getConnectedAgents() {
    return Array.from(this.connectedAgents.values());
  }
}

module.exports = { MCPServer };
