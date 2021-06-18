'use strict';

const request = require('request');

/**
 * updateBuildStatus with failure reason
 * @param  {Object}   buildConfig     build config of the job
 * @param  {String}   status          FAILURE
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

/**
 * Update build status async
 * @method updateBuildStatusAsync
 * @param  {Object}  config build config of the job
 * @param  {String}   status          FAILURE
 * @param  {String}   statusMessage   failure reason
 * @return {Promise}
 */
async function updateBuildStatusAsync(config, status, statusMessage) {
    const { buildId } = config;

    return new Promise((resolve, reject) => {
        request({
            json: true,
            method: 'PUT',
            uri: `${config.apiUri}/v4/builds/${buildId}`,
            body: {
                status,
                statusMessage
            },
            auth: {
                bearer: config.token
            }
        },
        (err, res) => {
            if (!err && res.statusCode === 200) {
                return resolve(res.body);
            }

            return reject(err);
        });
    });
}

module.exports = { updateBuildStatus, updateBuildStatusAsync };
