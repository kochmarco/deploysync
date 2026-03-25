const chokidar = require("chokidar");
const path = require("path");
const fs = require("fs");
const EventEmitter = require("events");

const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/vendor/**",
  "**/.git/**",
  "**/.env",
  "**/*.log",
  "**/.DS_Store",
  "**/Thumbs.db",
];

class FileWatcher extends EventEmitter {
  constructor(watchPath, extraIgnore = []) {
    super();
    this.watchPath = watchPath;
    this.ignorePatterns = [...DEFAULT_IGNORE, ...extraIgnore];
    this.watcher = null;
    this.isRunning = false;
    this._ready = false;
  }

  start() {
    if (this.isRunning) return;

    try {
      this.watcher = chokidar.watch(this.watchPath, {
        ignored: this.ignorePatterns,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 100,
        },
        depth: 20,
      });

      this.watcher.on("ready", () => {
        this._ready = true;
        this.isRunning = true;
        this.emit("ready");
      });

      this.watcher.on("add", (fp) => this._handleEvent("add", fp));
      this.watcher.on("change", (fp) => this._handleEvent("change", fp));
      this.watcher.on("unlink", (fp) => this._handleEvent("unlink", fp));

      this.watcher.on("error", (err) => {
        console.error("[Watcher] Error:", err.message);
        this.emit("error", err);
      });

      this.isRunning = true;
    } catch (err) {
      console.error("[Watcher] Failed to start:", err.message);
      this.emit("error", err);
    }
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.isRunning = false;
    this._ready = false;
  }

  _handleEvent(eventType, filePath) {
    const relativePath = path.relative(this.watchPath, filePath);
    let fileSize = null;

    try {
      if (eventType !== "unlink") {
        const stats = fs.statSync(filePath);
        fileSize = stats.size;
      }
    } catch (_) {}

    const data = {
      filePath: relativePath,
      absolutePath: filePath,
      eventType,
      source: "watcher",
      timestamp: Date.now(),
      fileSize,
    };

    this.emit("change", data);
  }
}

module.exports = { FileWatcher, DEFAULT_IGNORE };
