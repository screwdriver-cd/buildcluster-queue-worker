'use strict';

const amqp = require('amqp-connection-manager');
const threads = require('threads');
const helper = require('./lib/helper');
const config = require('./lib/config');
const logger = require('screwdriver-logger');
const { amqpURI, host, connectOptions,
    queue, queueOptions, prefetchCount,
    messageReprocessLimit, cacheStrategy, cachePath } = config.getConfig();
const spawn = threads.spawn;
const CACHE_STRATEGY_DISK = 'disk';
let channelWrapper;

/**
 * onMessage consume messages in batches, once its available in the queue. channelWrapper has in-built back pressure
 *            meaning if consumed messages are not ack'd or nack'd, it will not fetch more messages. Definitely need
 *            to ack or nack messages, otherwise it will halt indefinitely. submit start or stop jobs to build executor
 *            using threads.
 *            consume type from message properties to determine if message is to clear pipeline or job cache directory.
 *            message properties => type => should be in below json format:
 *              type: { "resource": "caches", "action": "delete", "scope": "pipelines", "prefix": "", "id": 124 }
 * @param  {Object} data  Message from queue with headers, timestamp, and other properties; will be used to ack or nack the message
 */
const onMessage = (data) => {
    try {
        const messageProperties = helper.getMessageProperties(data.properties);

        if (messageProperties.get('type') !== undefined) {
            const messageType = JSON.parse(messageProperties.get('type').toString());

            if (cacheStrategy === CACHE_STRATEGY_DISK && cachePath !== '' &&
                    messageType.resource === 'caches' && messageType.action === 'delete' &&
                    messageType.scope !== '' && messageType.id !== '') {
                const threadCache = spawn('./lib/cache.js');
                const job = `jobType: ${messageType.resource}, action: ${messageType.action}, ` +
                            `cacheStrategy: ${cacheStrategy}, cachePath: ${cachePath}, ` +
                            ` prefix: ${messageType.prefix}, entity: ${messageType.scope}, ` +
                            ` id: ${messageType.id}`;

                logger.info(`processing ${job}`);
                threadCache
                    .send([job, cachePath, messageType.prefix, messageType.scope, messageType.id])
                    .on('message', () => {
                        logger.info(`acknowledge, job completed for ${job}`);
                        channelWrapper.ack(data);
                        threadCache.kill();
                    })
                    .on('error', (error) => {
                        logger.info(`acknowledge, job ${job} - error: ${error} `);
                        channelWrapper.ack(data);
                        threadCache.kill();
                    })
                    .on('exit', () => {
                        logger.info(`thread terminated for ${job}`);
                    });
            } else {
                logger.info(`acknowledge, ${messageProperties.get('type').toString()} ` +
                            '- invalid - skip');
                channelWrapper.ack(data);
            }
        } else {
            const thread = spawn('./lib/jobs.js');
            const fullBuildConfig = JSON.parse(data.content);
            const buildConfig = fullBuildConfig.buildConfig;
            const jobType = fullBuildConfig.job;
            let retryCount = 0;

            const job = `jobId: ${buildConfig.jobId}, ` +
                `jobType: ${jobType}, buildId: ${buildConfig.buildId}`;

            logger.info(`processing ${job}`);

            if (messageProperties.get('headers-x-death') !== undefined) {
                retryCount = messageProperties.get('headers-x-death')[0].count;
                logger.info(`retrying ${retryCount}(${messageReprocessLimit}) for ` +
                    `${job}`);
            }

            thread
                .send([jobType, buildConfig, job])
                .on('message', () => {
                    logger.info(`acknowledge, job completed for ${job} `);
                    channelWrapper.ack(data);
                    thread.kill();
                })
                .on('error', (error) => {
                    if (retryCount >= messageReprocessLimit) {
                        logger.info(`acknowledge, max retries exceeded for ${job}`);
                        helper.updateBuildStatus(
                            buildConfig,
                            'FAILURE',
                            `${error}`,
                            (err, response) => {
                                if (err) {
                                // eslint-disable-next-line max-len
                                    logger.error(`failed to update build status for build ${buildConfig.buildId}: ${err} ${JSON.stringify(response)}`);
                                } else {
                                // eslint-disable-next-line max-len
                                    logger.info(`build status successfully updated for build ${buildConfig.buildId}`);
                                }
                            });
                        channelWrapper.ack(data);
                    } else {
                        logger.info(`err: ${error}, don't acknowledge, ` +
                        `retried ${retryCount}(${messageReprocessLimit}) for ${job}`);
                        channelWrapper.nack(data, false, false);
                    }
                    thread.kill();
                })
                .on('exit', () => {
                    logger.info(`thread terminated for ${job} `);
                });
        }
    } catch (err) {
        logger.error(`error ${err}, acknowledge data: ${data} payload: ${data.content} `);
        channelWrapper.ack(data);
    }
};

const connection = amqp.connect([amqpURI], connectOptions);

connection.on('connect',
    () => { logger.info('rabbitmq server connected!'); });

connection.on('disconnect', (params) => {
    logger.info(`server disconnected: ${params.err.stack}. ` +
      `reconnecting rabbitmq server ${host}`);
});

channelWrapper = connection.createChannel({
    setup(channel) {
        return Promise.all([
            channel.checkQueue(queue, queueOptions),
            channel.prefetch(prefetchCount),
            channel.consume(queue, onMessage)
        ]);
    }
});

channelWrapper.waitForConnect()
    .then(() => {
        logger.info(`waiting for messages in queue: ${queue}`);
    });
