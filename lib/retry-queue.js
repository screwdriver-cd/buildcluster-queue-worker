'use strict';

const amqp = require('amqp-connection-manager');
const logger = require('screwdriver-logger');
const config = require('./config');
const { amqpURI, connectOptions, retryQueue, exchange, retryQueueEnabled } = config.getConfig();

let retryQueueConn;

/**
 * Get the retry queue connection, if it exists reuse it, otherwise create it
 * @method getRetryQueueConn
 * @return {Promise}
 */
function getRetryQueueConn() {
    logger.info('Getting retry queue connection.');

    if (retryQueueConn) {
        return retryQueueConn;
    }

    retryQueueConn = amqp.connect([amqpURI], connectOptions);
    logger.info('Creating new retry queue connection.');

    retryQueueConn.on('connect', () => logger.info('Connected to retry queue!'));
    retryQueueConn.on('disconnect', params => logger.info('Disconnected from retry queue.', params.err.stack));

    return retryQueueConn;
}

/**
 * Pushes a message to the retry queue
 * @param {message} buildConfig build config
 * @param {messageId} messageId id of the message queue
 * @returns {Promise} resolves to null or error
 */
async function push(buildConfig, messageId) {
    if (!retryQueueEnabled) {
        return Promise.resolve();
    }

    const message = {
        job: 'verify',
        buildConfig
    };

    const channelWrapper = getRetryQueueConn().createChannel({
        json: true,
        setup: channel => channel.checkExchange(exchange)
    });

    logger.info('publishing msg to retry queue: %s', messageId);

    return channelWrapper
        .publish(exchange, retryQueue, message, {
            contentType: 'application/json',
            persistent: true
        })
        .then(() => {
            logger.info('successfully publishing msg id %s -> queue %s', messageId, retryQueue);

            return channelWrapper.close();
        })
        .catch(err => {
            logger.error('publishing failed to retry queue: %s', err.message);
            channelWrapper.close();

            throw err;
        });
}

module.exports.push = push;
