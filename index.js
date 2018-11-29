'use strict';

const amqp = require('amqp-connection-manager');
const winston = require('winston');
const threads = require('threads');
const helper = require('./lib/helper');
const rabbitmqConf = require('./config/rabbitmq');
const { amqpURI, host, connectOptions,
    queue, queueOptions, prefetchCount,
    messageReprocessLimit } = rabbitmqConf.getConfig();
const spawn = threads.spawn;
const logger = winston.createLogger({
    transports: [
        new winston.transports.Console()
    ]
});

let channelWrapper;

/**
 * onMessage consume messages in batches, once its available in the queue. channelWrapper has in-built back pressure
 *            meaning if consumed messages are not ack'd or nack'd, it will not fetch more messages. Definitely need
 *            to ack or nack messages, otherwise it will halt indefinitely. submit start or stop jobs to k8s executor
 *            using threads
 * @param  {Object} data  Message from queue with headers, timestamp, and other properties; will be used to ack or nack the message
 * @return {}             none
 */
const onMessage = (data) => {
    try {
        const fullBuildConfig = JSON.parse(data.content);
        const jobType = fullBuildConfig.job;
        const buildConfig = fullBuildConfig.buildConfig;
        const thread = spawn('./lib/jobs.js');
        let retryCount = 0;
        const job = `jobId: ${buildConfig.buildId}, ` +
                            `jobType: ${jobType}, buildId: ${buildConfig.buildId}`;

        logger.info(`processing ${job}`);

        if (Object.keys(data.properties.headers).length > 0) {
            retryCount = data.properties.headers['x-death'][0].count;
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
                        'FAILED',
                        `${error}`,
                        (err) => {
                            if (!err) {
                                logger.error(`failed to update build status. reason: ${error} `);
                            } else {
                                logger.info('build status successfully updated');
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
