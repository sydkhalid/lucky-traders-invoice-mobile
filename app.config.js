const appJson = require('./app.json');

const config = appJson.expo;

module.exports = () => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    syncServerUrl: process.env.EXPO_PUBLIC_SYNC_SERVER_URL || config.extra?.syncServerUrl || '',
    syncApiKey: process.env.EXPO_PUBLIC_SYNC_API_KEY || config.extra?.syncApiKey || '',
  },
});
