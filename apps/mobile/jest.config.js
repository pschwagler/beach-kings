module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|nativewind)',
  ],
  moduleNameMapper: {
    // Stub CSS files so they don't blow up the test runner
    '\\.css$': '<rootDir>/jest.css-stub.js',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@beach-kings/shared/tokens$': '<rootDir>/../../packages/shared/src/tokens/index.ts',
    '^@beach-kings/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    // react-native-worklets lives at the monorepo root but not inside apps/mobile.
    // babel-preset-expo detects it and tries to load the Babel plugin, which fails
    // in Jest. Stub it with a no-op plugin so the test runner can start.
    '^react-native-worklets/plugin$': '<rootDir>/jest.worklets-stub.js',
    // Stub reanimated — the global mock is in jest.setup.js; this ensures
    // module resolution succeeds before the mock factory runs.
    '^react-native-reanimated$': '<rootDir>/jest.reanimated-stub.js',
    '^react-native-reanimated/mock$': '<rootDir>/jest.reanimated-stub.js',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
