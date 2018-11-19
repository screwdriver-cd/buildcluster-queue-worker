'use strict';

const amqp = require('amqp-connection-manager');
const winston = require('winston');
const threads = require('threads');
const helper = require('./lib/helper');
const rabbitmqConf = require('./config/rabbitmq');
const { amqpURI, host, connectOptions, reconnectLimit,
    queue, queueOptions, prefetchCount,
    messageReprocessLimit } = rabbitmqConf.getConfig();
const spawn = threads.spawn;
const logger = winston.createLogger({
    transports: [
        new winston.transports.Console()
        // new winston.transports.File({ filename: 'combined.log' })
    ]
});

let channelWrapper;
let reconnectCounter = 0;

/**
 * [submitJob submit start or stop jobs to k8s executor]
 * @param  {[Object]} data          [Message from queue with headers, timestamp, and other properties; will be used to ack or nack the message]
 * @param  {[String]} job           [job name, either start or stop]
 * @param  {[Object]} buildConfig   [full buildConfig details to be sent to k8s executor]
 * @return {[type]}                 [none]
 */
function submitJob(data, job, buildConfig) {
    const thread = spawn('./lib/jobs.js');

    thread
        .send([job, buildConfig])
        .on('done', () => {
            logger.info(`acknowledge, k8s executor.${job} ` +
              `job completed for buildId ${buildConfig.buildId} `);
            channelWrapper.ack(data);
            thread.kill();
        })
        .on('error', (error) => {
            logger.info(`err: ${error}. don't acknowledge, k8s executor.${job} ` +
              `job errored for buildId ${buildConfig.buildId} `);
            channelWrapper.nack(data, false, false);
            thread.kill();
        })
        .on('exit', () => {
            logger.info('k8s executor thread terminated for ' +
              `job: ${job} buildId: ${buildConfig.buildId} `);
        });
}

/**
 * [onMessage consume messages in batches, once its available in the queue. channelWrapper has in-built back pressure
 *            meaning if consumed messages are not ack'd or nack'd, it will not fetch more messages. Definitely need
 *            to ack or nack messages, otherwise it will halt indefinitely. ]
 * @param  {[Object]} data  [Message from queue with headers, timestamp, and other properties; will be used to ack or nack the message]
 * @return {[type]}         [none]
 */
function onMessage(data) {
    try {
        const fullBuildConfig = JSON.parse(data.content);
        const job = fullBuildConfig.job;
        const buildConfig = fullBuildConfig.buildConfig;

        logger.info(`processing job: ${job} for buildId: ${buildConfig.buildId}`);
        if (Object.keys(data.properties.headers).length > 0) {
            const retryCount = data.properties.headers['x-death'][0].count;
            const failureMessage = data.properties.headers['x-death'][0].reason;

            logger.info(`failure reason: ${failureMessage}, retried ${retryCount}` +
            `(${messageReprocessLimit})`);
            if (retryCount > messageReprocessLimit) {
                helper.updateBuildStatus({
                    buildConfig: fullBuildConfig,
                    status: 'FAILURE',
                    statusMessage: `${failureMessage}`
                }, (err) => {
                    if (!err) {
                        logger.error(`failed to update build status. reason: ${failureMessage} `);
                    } else {
                        logger.info('build status successfully updated');
                    }
                });
                logger.info(`acknowledge, max retries exceeded
                  for job:${job}, buildId: ${buildConfig.buildId}`);
                channelWrapper.ack(data);
            } else {
                submitJob(data, job, buildConfig);
            }
        } else {
            submitJob(data, job, buildConfig);
        }
    } catch (err) {
        logger.error(`error ${err}, acknowledge data: ${data} payload: ${data.content} `);
        channelWrapper.ack(data);
    }
}

/**
 * [boot connect to rabbitmqserver with heartbeat check, autoconnect options and start channel to consume messages]
 * @return {[type]} [none]
 */
async function boot() {
    const connection = await amqp.connect([amqpURI], connectOptions);

    connection.on('connect',
        () => { reconnectCounter = 0; logger.info('rabbitmq server connected!'); });
    connection.on('disconnect', (params) => {
        logger.info(`server disconnected: ${params.err.stack}`);
        if (reconnectCounter >= reconnectLimit) {
            logger.error(`exceeded max server reconnect limit ${reconnectLimit}. exit app ... `);
            process.exit(1);
        }
        logger.info(`reconnecting rabbitmq server ${host} ...
        ${reconnectCounter} (${reconnectLimit}) `);
        reconnectCounter += 1;
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
}

boot();
