module.exports = function (api) {
  const isTest = api.env('test');
  const isProduction = !isTest && process.env.NODE_ENV === 'production';
  api.cache(true);

  return {
    presets: [
      // In test mode omit jsxImportSource so TS type annotations inside
      // jest.mock() factory functions parse correctly with babel-preset-expo.
      isTest
        ? ['babel-preset-expo']
        : ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      ...(isTest ? [] : ['nativewind/babel']),
    ],
    plugins: [
      ...(isProduction
        ? ['./babel-plugins/redirect-production-development-modules']
        : []),
      ...(isTest ? [] : ['react-native-worklets/plugin']),
    ],
  };
};
