module.exports = function (api) {
  const isTest = api.env('test');
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
      ...(isTest ? [] : ['react-native-worklets/plugin']),
    ],
  };
};
