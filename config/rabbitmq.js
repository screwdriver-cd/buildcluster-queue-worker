'use strict';

const config = require('config');

const rabbitmqConfig = config.get('rabbitmq');
const { protocol, username, password, host, port, vhost, connectOptions, reconnectLimit,
    queue, queueOptions, prefetchCount,
    messageReprocessLimit } = rabbitmqConfig;
const amqpURI = `${protocol}://${username}:${password}@${host}:${port}${vhost}`;

/**
 * get configurations to connect to rabbitmq server
 * @method getConfig
 * @return {Object}
 */
function getConfig() {
    return {
        amqpURI,
        host,
        connectOptions,
        reconnectLimit,
        queue,
        queueOptions,
        prefetchCount,
        messageReprocessLimit
    };
}

module.exports = { getConfig };
