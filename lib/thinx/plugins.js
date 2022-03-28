const fs = require("fs");
class Plugins {

  constructor() {
    this.plugins = {};
  }

  async loadFromConfig(path='./plugins/plugins.json') {
    let contents = fs.readFileSync(path);
    const plugins = JSON.parse(contents);
    for (let plugin in plugins) {
      this.load(plugin);
    }
  }

  async load(plugin) {
    const path = `./plugins/${plugin}/plugin.js`;
    try {
      const module = require(path);
      // for debugging use: console.log("module", module);
      this.plugins[plugin] = module;
      await this.plugins[plugin].load();
    } catch (e) {
      console.log(`[error] [plugins] Failed to load '${plugin}'`);
    }
  }

  async use(path) {
    let results = [];
    for (let plugin in this.plugins) {
      let result = this.plugins[plugin].check(path);
      if (result) {
        results.push(result);
      }
    }
    return results[results.length-1];
  }

  extensions() {
    let results = new Set();
    for (let plugin in this.plugins) {
      let xts = this.plugins[plugin].extensions();
      if (xts) {
        for (let xt in xts) {
          results.add(xt);
        }
      }
    }
    return Array.from(results);
  }
}

module.exports = Plugins;