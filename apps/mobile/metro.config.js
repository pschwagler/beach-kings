const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo support: retain Expo's defaults and add the workspace root.
config.watchFolders = [...new Set([...(config.watchFolders ?? []), monorepoRoot])];

// Resolve modules from both the project and the monorepo root
config.resolver.nodeModulesPaths = [
  ...new Set([
    ...(config.resolver.nodeModulesPaths ?? []),
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
  ]),
];

module.exports = withNativeWind(config, { input: './global.css' });
