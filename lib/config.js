'use strict';

const config = require('config');

const rabbitmqConfig = config.get('rabbitmq');
const ecosystemConfig = config.get('ecosystem');

const { strategy, path } = ecosystemConfig.cache;
const {
    protocol,
    username,
    password,
    host,
    port,
    vhost,
    connectOptions,
    queue,
    prefetchCount,
    messageReprocessLimit,
    retryQueue,
    retryQueueEnabled,
    exchange
} = rabbitmqConfig;
const amqpURI = `${protocol}://${username}:${password}@${host}:${port}${vhost}`;

/**
 * get configurations to connect to rabbitmq server, cache strategy and cache path
 * @method getConfig
 * @return {Object}
 */
function getConfig() {
    return {
        amqpURI,
        host,
        connectOptions: JSON.parse(connectOptions),
        queue,
        prefetchCount: Number(prefetchCount),
        messageReprocessLimit: Number(messageReprocessLimit),
        cacheStrategy: strategy,
        cachePath: path,
        retryQueue,
        retryQueueEnabled,
        exchange
    };
}

module.exports = { getConfig };
