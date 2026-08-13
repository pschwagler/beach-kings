const { withNativeWind } = require('nativewind/metro');
const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getSentryExpoConfig(projectRoot);

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

const nativeWindConfig = withNativeWind(config, {
  input: path.resolve(projectRoot, 'global.css'),
  configPath: path.resolve(projectRoot, 'tailwind.config.ts'),
  projectRoot,
});

// Sentry's serializer emits the debug IDs needed to match production bundles
// with source maps. Build credentials are supplied only through EAS variables.
module.exports = nativeWindConfig;
