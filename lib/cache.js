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
module.exports = function cacheExecutor([job, cachePath, prefix, scope, id]) {
    logger.info(`submit ${job}`);

    let dir = `${cachePath}/${scope}/${id}`;

    if (prefix !== '') {
        dir = `${cachePath}/${prefix}/${scope}/${id}`;
    }

    return fs.remove(dir)
        .then(() => Promise.resolve('successfully removed directory'))
        .catch(err => Promise.reject(err));
};
