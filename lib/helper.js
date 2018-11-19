'use strict';

const request = require('request');

/**
 * Update build status to FAILURE
 * @method updateBuildStatus
 * @param  {Object}          updateConfig              build config of the job
 * @param  {Function}        [callback]                Callback function
 * @return {Object}          err                       Callback with err object
 */
function updateBuildStatus(fullBuildConfig, statusMessage, callback) {
    return request({
        json: true,
        method: 'PUT',
        uri: `${fullBuildConfig.apiUri}/v4/builds/${fullBuildConfig.buildId}`,
        body: {
            status,
            statusMessage
        },
        auth: {
            bearer: fullBuildConfig.token
        }
    }, (err, response) => {
        if (!err && response.statusCode === 200) {
            return callback(null);
        }

        return callback(err, response);
    });
}

module.exports = { updateBuildStatus };
