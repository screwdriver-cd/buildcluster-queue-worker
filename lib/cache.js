'use strict';

const fs = require('fs-extra');
const logger = require('screwdriver-logger');

/**
 * cacheExecutor remove cache directory
 * @param  {String}   dir2Clean     directory to be deleted
 * @return {promise}                return promise
 */
module.exports = function cacheExecutor([dir2Clean]) {
    logger.info(`attempting to clear cache directory: ${dir2Clean}`);

    return fs
        .remove(dir2Clean)
        .then(() => Promise.resolve('successfully removed directory'))
        .catch(err => Promise.reject(err));
};
