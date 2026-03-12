const loaded = require("./_handler.js");
const handler = loaded.default || loaded.handler || loaded;

module.exports = handler;
module.exports.default = handler;
