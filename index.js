'use strict';

(async() => {
    const conf = require('config');
    const httpdConfig = conf.get('httpd'); // Setup HTTPd
    const server = require('./lib/server');
    const receiver = require('./receiver');
    const connection = await receiver.listen();

    server(httpdConfig, connection);
})();

