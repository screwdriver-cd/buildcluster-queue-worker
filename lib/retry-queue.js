'use strict';

const amqp = require('amqp-connection-manager');
const logger = require('screwdriver-logger');
const config = require('./config');
const { amqpURI, connectOptions, exchange, retryQueueEnabled, retryDelayedQueue } = config.getConfig();

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
 * Pushes a message to the retry wait queue (delay queue)
 * Messages will sit in the wait queue for the specified delay before being routed to the ready queue
 * @param {message} buildConfig build config
 * @param {messageId} messageId id of the message queue
 * @param {number} delayMs delay in milliseconds (supports dynamic delays for progressive backoff)
 * @param {number} retryCount current retry count (optional, defaults to 0)
 * @param {number} buildStartTime timestamp when build verification started (optional)
 * @returns {Promise} resolves to null or error
 */
async function push(buildConfig, messageId, delayMs = 30000, retryCount = 0, buildStartTime = null) {
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

    // Publish to the WAIT queue, not the ready queue with  per-message TTL
    const waitQueue = retryDelayedQueue;
    const delaySec = (delayMs / 1000).toFixed(0);

    logger.info('publishing msg to retry wait queue: %s (will delay %ss)', messageId, delaySec);

    // Add headers for timeout tracking and retry count
    const headers = {
        'x-build-start-time': buildStartTime || Date.now(),
        'x-retry-count': retryCount
    };

    return channelWrapper
        .publish(exchange, waitQueue, message, {
            contentType: 'application/json',
            persistent: true,
            headers,
            expiration: String(delayMs)
        })
        .then(() => {
            logger.info(
                'successfully published msg id %s -> wait queue %s (delay: %ss)',
                messageId,
                waitQueue,
                delaySec
            );

            return channelWrapper.close();
        })
        .catch(err => {
            logger.error('publishing failed to retry wait queue: %s', err.message);
            channelWrapper.close();

            throw err;
        });
}

module.exports.push = push;
