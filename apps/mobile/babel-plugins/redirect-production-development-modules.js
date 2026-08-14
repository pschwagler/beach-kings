/**
 * Redirect development-only modules to inert production stubs before Metro
 * collects dependencies. Runtime `__DEV__` checks are insufficient here:
 * Metro can retain a dead module factory (and its strings) in Hermes bytecode.
 */
module.exports = function redirectProductionDevelopmentModules() {
  const redirects = new Map([
    [
      '@/components/dev/DevLoginPanel',
      '@/components/dev/DevLoginPanel.production',
    ],
    [
      '@/components/dev/authExtension',
      '@/components/dev/authExtension.production',
    ],
  ]);

  return {
    name: 'redirect-production-development-modules',
    visitor: {
      ImportDeclaration(path) {
        const replacement = redirects.get(path.node.source.value);
        if (replacement != null) path.node.source.value = replacement;
      },
    },
  };
};
