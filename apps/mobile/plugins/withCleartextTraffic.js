const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults.manifest;
    const mainApplication = androidManifest.application[0];
    mainApplication.$['android:usesCleartextTraffic'] = 'true';
    return config;
  });
};
