// The backend lives in server/ and is not part of the app bundle. Keeping Metro out of it avoids crawling
// its node_modules and stops anything there being picked up by accident.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const serverDir = require('path').join(__dirname, 'server').replace(/[\/]/g, '[\\/]');
config.resolver.blockList = [].concat(config.resolver.blockList ?? [], new RegExp(`${serverDir}[\\/].*`));

module.exports = config;
