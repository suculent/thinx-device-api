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
      console.log("module", module);
      this.plugins[plugin] = module;
      await this.plugins[plugin].load();
      console.log(`Loaded plugin: '${plugin}'`);
    } catch (e) {
      console.log(`Failed to load '${plugin}'`);
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
    return results.join(''); // TODO: In case there are multiple platforms, preference or order should be dealt with
  }
}

module.exports = Plugins;