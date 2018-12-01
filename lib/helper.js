'use strict';

const request = require('request');

/**
 * updateBuildStatus with failure reason
 * @param  {Object}   buildConfig     build config of the job
 * @param  {String}   status          FAILED
 * @param  {String}   statusMessage   failure reason
 * @param  {Function} callback        Callback function
 * @return {Object}   err             Callback with err object
 */
function updateBuildStatus(buildConfig, status, statusMessage, callback) {
    return request({
        json: true,
        method: 'PUT',
        uri: `${buildConfig.apiUri}/v4/builds/${buildConfig.buildId}`,
        body: {
            status,
            statusMessage
        },
        auth: {
            bearer: buildConfig.token
        }
    }, (err, response) => {
        if (!err && response.statusCode === 200) {
            return callback(null);
        }

        return callback(err, response);
    });
}

module.exports = { updateBuildStatus };
