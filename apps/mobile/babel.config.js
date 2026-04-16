module.exports = function (api) {
  const isTest = api.env('test');
  api.cache(true);

  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      // nativewind/babel pulls in react-native-worklets/plugin (reanimated 4+),
      // which is not installed — skip it in the Jest environment.
      ...(isTest ? [] : ['nativewind/babel']),
    ],
    plugins: [
      // react-native-reanimated/plugin is mocked in tests; skip to avoid
      // the react-native-worklets transitive dependency in the Jest environment.
      ...(isTest ? [] : ['react-native-reanimated/plugin']),
    ],
  };
};
