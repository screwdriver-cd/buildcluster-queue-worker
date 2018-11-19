'use strict';

const winston = require('winston');
const config = require('config');
const ExecutorRouter = require('screwdriver-executor-router');

const ecosystem = config.get('ecosystem');
const executorConfig = config.get('executor');
const executorPlugins = Object.keys(executorConfig).reduce((aggregator, keyName) => {
    if (keyName !== 'plugin') {
        aggregator.push(Object.assign({
            name: keyName
        }, executorConfig[keyName]));
    }

    return aggregator;
}, []);
const executor = new ExecutorRouter({
    defaultPlugin: executorConfig.plugin,
    executor: executorPlugins,
    ecosystem
});
const logger = winston.createLogger({
    transports: [
        new winston.transports.Console()
        // new winston.transports.File({ filename: 'combined.log' })
    ]
});

/**
 * [k8sExectutor call executor.start or executor.stop with the buildConfig obtained from rabbitmq.
 * For any error, control will be returned to caller submitJob function defined in index.js ]
 * @param  {[String, Object]}   job   [job name, either start or stop]
 * @param  {Function}           done  [callback for thread]
 * @return {[type]}                   [return true]
 */
module.exports = function k8sExectutor([job, buildConfig], done) {
    logger.info(`submit ${job} job for buildId ${buildConfig.buildId} to k8s`);
    switch (job) {
    case 'start':
        executor.start(buildConfig);
        break;
    case 'stop':
        executor.start(buildConfig);
        break;
    default:
        logger.info(`job type expected: 'start' or 'stop', actual: '${job}' `);
        break;
    }
    done({ boolean: true });

    return true;
};
