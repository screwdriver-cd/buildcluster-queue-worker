'use strict';

const config = require('config');

const rabbitmqConfig = config.get('rabbitmq');
const ecosystemConfig = config.get('ecosystem');
const cachePath = ecosystemConfig.cache.path;
const { protocol, username, password, host, port, vhost, connectOptions,
    queue, queueOptions, prefetchCount,
    messageReprocessLimit } = rabbitmqConfig;
const amqpURI = `${protocol}://${username}:${password}@${host}:${port}${vhost}`;

/**
 * get configurations to connect to rabbitmq server and cachePath
 * @method getConfig
 * @return {Object}
 */
function getConfig() {
    return {
        amqpURI,
        host,
        connectOptions,
        queue,
        queueOptions,
        prefetchCount: Number(prefetchCount),
        messageReprocessLimit: Number(messageReprocessLimit),
        cachePath
    };
}

module.exports = { getConfig };
