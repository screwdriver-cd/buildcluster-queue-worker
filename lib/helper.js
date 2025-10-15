'use strict';

const request = require('screwdriver-request');

/**
 * Update build status async
 * @method updateBuildStatusAsync
 * @param  {Object}   config            Build config of the job
 * @param  {String}   status            Status ex: FAILURE
 * @param  {String}   statusMessage     Failure reason
 * @return {Promise}
 */
async function updateBuildStatusAsync(config, status, statusMessage) {
    const { buildId } = config;
    const payload = {};

    if (status) {
        payload.status = status;
    }
    if (statusMessage) {
        payload.statusMessage = statusMessage;
    }

    return request({
        method: 'PUT',
        url: `${config.apiUri}/v4/builds/${buildId}`,
        json: payload,
        context: {
            token: config.token
        }
    }).then(res => res.body);
}

module.exports = { updateBuildStatusAsync };
