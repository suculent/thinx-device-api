const fs = require("fs");

class Plugins {
  constructor() {
    //super();
    this.plugins = {};
  }

  async loadFromConfig(path='./plugins/plugins.json') {
    const plugins = JSON.parse(fs.readFileSync(path)).plugins;
    for (let plugin in plugins) {
      if (plugins[plugin].enabled) {
        this.load(plugin);
      }
    }
  }

  async load(plugin) {
    const path = plugins[plugin];
    try {
      const module = require(path);
      this.plugins[plugin] = module;
      await this.plugins[plugin].load(this.app);
      console.log(`Loaded plugin: '${plugin}'`);
    } catch (e) {
      console.log(`Failed to load '${plugin}'`);
    }
  }
}

module.exports = Plugins;