const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add monorepo workspace directories so Metro can resolve packages outside apps/android
config.watchFolders = [
  ...config.watchFolders || [],
  __dirname + '/../../packages',
];

// Allow resolving @shared alias through metro
config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    '@shared': __dirname + '/../../packages/shared/src',
  },
};

module.exports = config;