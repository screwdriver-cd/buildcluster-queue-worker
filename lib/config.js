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
    exchange,
    initTimeout
} = rabbitmqConfig;
const amqpURI = `${protocol}://${username}:${password}@${host}:${port}${vhost}`;

/**
 * convert value to Boolean
 * @method convertToBool
 * @param {(Boolean|String)} value
 * @return {Boolean}
 */
function convertToBool(value) {
    if (typeof value === 'boolean') {
        return value;
    }

    // trueList refers to https://yaml.org/type/bool.html
    const trueList = ['on', 'true', 'yes', 'y'];
    const lowerValue = String(value).toLowerCase();

    return trueList.includes(lowerValue);
}

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
        retryQueueEnabled: convertToBool(retryQueueEnabled),
        exchange,
        initTimeout: Number(initTimeout) || 5
    };
}

module.exports = { getConfig };
