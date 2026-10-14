const path = require('node:path');
const appRoot = __dirname;
const projectRoot = path.dirname(appRoot);
const uiRoot = path.join(appRoot, 'ui');
const resourcesRoot = path.join(projectRoot, 'resources');
module.exports = {
  appRoot, projectRoot, uiRoot,
  certsDir: path.join(resourcesRoot, 'certs'),
  seedPath: path.join(resourcesRoot, 'data', 'initial-state.json'),
  iconPath: path.join(projectRoot, 'icons', 'icon.ico'),
  preloadPath: path.join(appRoot, 'desktop', 'preload.cjs'),
  downloadsDir: path.join(projectRoot, 'downloads')
};
