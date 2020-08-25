'use strict';

const config = require('config');
const ExecutorRouter = require('screwdriver-executor-router');
const logger = require('screwdriver-logger');

const ecosystem = config.get('ecosystem');
const executorConfig = config.get('executor');

const executorPlugins = Object.keys(executorConfig).reduce((aggregator, keyName) => {
    if (keyName !== 'plugin') {
        aggregator.push(Object.assign({
            name: executorConfig[keyName].name || keyName
        }, executorConfig[keyName]));
    }

    return aggregator;
}, []);

const executor = new ExecutorRouter({
    defaultPlugin: executorConfig.plugin,
    executor: executorPlugins,
    ecosystem
});

/**
 * buildExecutor start or stop build
 * @param  {String}   jobType     start or stop
 * @param  {Object}   buildConfig build config
 * @param  {String}   job         concatenated log message jobId, jobType, buildId
 * @return {promise}              return promise
 */
module.exports = function buildExecutor([jobType, buildConfig, job]) {
    logger.info(`submit ${job}`);
    switch (jobType) {
    case 'start':
        return executor.start(buildConfig);
    case 'stop':
        delete buildConfig.token;

        return executor.stop(buildConfig);
    default:
        logger.info(`job type expected: 'start' or 'stop', actual: '${jobType}' `);

        return Promise.resolve();
    }
};
