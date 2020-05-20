'use strict';

const request = require('request');

/**
 * getMessageProperties - get message header, type and return as a map
 * @param  {Object} properties    message properties
 * @return {Map}    map           map of headers and type
 */
function getMessageProperties(properties) {
    const map = new Map();

    if (properties.headers !== undefined) {
        if (Object.keys(properties.headers).length > 0) {
            const keys = Object.keys(properties.headers);

            keys.forEach((val) => {
                map.set(`headers-${val}`, properties.headers[val]);
            });
        }
    }

    if (properties.type !== undefined) {
        if (Object.keys(properties.type).length > 0) {
            map.set('type', properties.type);
        }
    }

    return map;
}

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

module.exports = { updateBuildStatus, getMessageProperties };
