'use strict';

const conf = require('config');
const httpdConfig = conf.get('httpd'); // Setup HTTPd
const server = require('./lib/server');
const receiver = require('./receiver');

(async () => {
    const connection = await receiver.listen();

    server(httpdConfig, connection);
})();
