/**
 * Stub for react-native-worklets/plugin.
 *
 * react-native-worklets is installed at the monorepo root but not locally
 * inside apps/mobile. babel-preset-expo detects the package via hasModule()
 * and then tries to require the Babel plugin, which fails in the Jest
 * environment because Node resolves from the app directory. This stub
 * returns a no-op Babel plugin so the test runner can start normally.
 */
module.exports = function noopWorkletsPlugin() {
  return { visitor: {} };
};
