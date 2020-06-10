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
 *            job = 'start' (or) 'stop' => message is to start or stop build.
 *            job = 'clear' => message is to clear pipeline or job cache directory.
 *              clear cache message should be in below json format:
 *                  {"job":"clear","cacheConfig":{"resource":"caches","action":"delete","scope":"pipelines","prefix":"","pipelineId": 1,id":1}}
 *                  scope => "pipelines" (or) jobs; id => based on scope, either pipeline id (or) job id
 * @param  {Object} data  Message from queue with headers, timestamp, and other properties; will be used to ack or nack the message
 */
const onMessage = (data) => {
    try {
        const fullBuildConfig = JSON.parse(data.content);
        const jobType = fullBuildConfig.job;
        const buildConfig = fullBuildConfig.buildConfig || fullBuildConfig.cacheConfig;

        if (jobType === 'clear') {
            const threadCache = spawn('./lib/cache.js');
            const job = `jobType: ${jobType}, cacheConfig: ${buildConfig}`;

            logger.info(`processing ${job}`);

            if (cacheStrategy === CACHE_STRATEGY_DISK && cachePath !== '' &&
                buildConfig.resource === 'caches' && buildConfig.action === 'delete' &&
                buildConfig.scope !== '' && buildConfig.pipelineId !== '' &&
                buildConfig.id !== '') {
                // eslint-disable-next-line max-len
                let dir2Clean = (buildConfig.prefix !== '') ? `${cachePath}/${buildConfig.prefix}` : `${cachePath}`;

                dir2Clean = `${dir2Clean}/${buildConfig.scope}/${buildConfig.pipelineId}`;

                if (buildConfig.scope !== 'pipelines') {
                    dir2Clean = `${dir2Clean}/${buildConfig.id}`;
                }

                logger.info(`cache directory to clean: ${dir2Clean}`);
                threadCache
                    .send([dir2Clean])
                    .on('message', () => {
                        logger.info(`acknowledge, clear cache job completed for ${dir2Clean}`);
                        channelWrapper.ack(data);
                        threadCache.kill();
                    })
                    .on('error', (error) => {
                        logger.info(`acknowledge, clear cache job for ${dir2Clean} ` +
                            `- error: ${error} `);
                        channelWrapper.ack(data);
                        threadCache.kill();
                    })
                    .on('exit', () => {
                        logger.info(`thread terminated for clear cache job ${dir2Clean}`);
                    });
            } else {
                logger.error(`required conditions not met, cacheStrategy: ${cacheStrategy}, ` +
                    `cachePath: ${cachePath}, cacheConfig: ${buildConfig}, ` +
                    `acknowledge data: ${data}, payload: ${data.content} `);
                channelWrapper.ack(data);
            }
        } else {
            const thread = spawn('./lib/jobs.js');
            let retryCount = 0;
            const job = `jobId: ${buildConfig.jobId}, ` +
                `jobType: ${jobType}, buildId: ${buildConfig.buildId}`;

            logger.info(`processing ${job}`);

            if (typeof data.properties.headers !== 'undefined') {
                if (Object.keys(data.properties.headers).length > 0) {
                    retryCount = data.properties.headers['x-death'][0].count;
                    logger.info(`retrying ${retryCount}(${messageReprocessLimit}) for ` +
                        `${job}`);
                }
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
