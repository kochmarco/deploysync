const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ConfigStore {
  constructor() {
    const userDataPath = app.getPath('userData');
    this.filePath = path.join(userDataPath, 'deploysync-config.json');
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      }
    } catch (err) {
      console.error('[ConfigStore] Error loading config:', err.message);
    }
    return {};
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ConfigStore] Error saving config:', err.message);
    }
  }

  get(key, defaultValue = undefined) {
    return this.data[key] !== undefined ? this.data[key] : defaultValue;
  }

  set(key, value) {
    this.data[key] = value;
    this._save();
  }

  getAll() {
    return { ...this.data };
  }
}

module.exports = { ConfigStore };
