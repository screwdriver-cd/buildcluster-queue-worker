'use strict';

const fs = require('fs-extra');
const logger = require('screwdriver-logger');

/**
 * cacheExecutor remove cache directory
 * @param  {String}   job        concatenated log message
 * @param  {String}   cachePath  cache directory
 * @param  {String}   prefix      beta- (for beta) or blank (for prod)
 * @param  {String}   entity     pipelines or jobs
 * @param  {String}   id         pipeline id or job id
 * @return {promise}             return promise
 */
module.exports = function cacheExecutor([job, cachePath, prefix, entity, id]) {
    logger.info(`submit: ${job}`);

    let dir = `${cachePath}/${entity}/${id}`;

    if (prefix !== '') {
        dir = `${cachePath}/${prefix}/${entity}/${id}`;
    }

    return fs.remove(dir)
        .then(() => logger.info('successfully removed directory'))
        .catch(err => logger.error(err));
};
