const SftpClient = require("ssh2-sftp-client");
const path = require("path");

class SftpManager {
  constructor() {
    this.client = new SftpClient();
    this.connected = false;
  }

  async connect(config) {
    const opts = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
    };

    if (config.privateKeyPath) {
      const fs = require("fs");
      const keyPath = config.privateKeyPath.replace(/^~/, process.env.HOME || "");
      opts.privateKey = fs.readFileSync(keyPath, "utf8");
      if (config.passphrase) opts.passphrase = config.passphrase;
    } else if (config.password) {
      opts.password = config.password;
    }

    await this.client.connect(opts);
    this.connected = true;
  }

  async upload(localPath, remotePath) {
    if (!this.connected) throw new Error("Not connected to SFTP server");

    const remoteDir = path.posix.dirname(remotePath);
    try {
      await this.client.stat(remoteDir);
    } catch {
      await this.client.mkdir(remoteDir, true);
    }

    await this.client.put(localPath, remotePath);
  }

  async download(remotePath, localPath) {
    if (!this.connected) throw new Error("Not connected");
    await this.client.get(remotePath, localPath);
  }

  async exists(remotePath) {
    try {
      await this.client.stat(remotePath);
      return true;
    } catch {
      return false;
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.client.end();
      this.connected = false;
    }
  }
}

module.exports = { SftpManager };
