'use strict';

const Hapi = require('@hapi/hapi');
const logger = require('screwdriver-logger');

module.exports = async (config, amqpConnection) => {
    try {
        const server = new Hapi.Server({
            port: config.port,
            host: config.host,
            uri: config.uri,
            routes: {
                log: { collect: true }
            },
            router: {
                stripTrailingSlash: true
            }
        });

        server.route([
            {
                method: 'GET',
                path: '/health',
                config: {
                    description: 'RabbitMQ connection status',
                    notes: 'Should respond with 200: ok',
                    tags: ['api']
                },
                handler(request, h) {
                    if (amqpConnection.isConnected()) {
                        return h.response('ok').code(200);
                    }

                    return h.response('unavailable').code(503);
                }
            }
        ]);

        await server.start();
        logger.info('Server running on %s', server.info.uri);

        return server;
    } catch (err) {
        logger.error(`Error in starting server ${err}`);
        throw err;
    }
};

process.on('unhandledRejection', (err) => {
    logger.error('Unhandled error', err);
    process.exit(1);
});
