'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Helper Test', () => {
    const fullBuildConfig = JSON.parse('{"job":"stop",' +
                                      '"buildConfig": {' +
                                        '"jobId": 1111,' +
                                        '"annotations": { ' +
                                          '"beta.screwdriver.cd/executor": "k8s" ' +
                                            '},' +
                                        '"blockedBy": [' +
                                          '1111' +
                                        '],' +
                                        '"apiUri": "foo.bar",' +
                                        '"buildId": 11111,' +
                                        '"container": "node:6",' +
                                        '"token": "fake"' +
                                      '}' +
                                    '}');
    const status = 'FAILED';
    const statusMessage = 'exhausted retries';
    const requestOptions = {
        auth: { bearer: 'fake' },
        json: true,
        method: 'PUT',
        body: {
            status,
            statusMessage
        },
        uri: `foo.bar/v4/builds/${fullBuildConfig.buildConfig.buildId}`
    };
    let mockRequest;
    let helper;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        mockRequest = sinon.stub();
        mockery.registerMock('request', mockRequest);

        // eslint-disable-next-line global-require
        helper = require('../lib/helper.js');
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
        process.removeAllListeners('SIGTERM');
    });

    after(() => {
        mockery.disable();
    });

    it('logs correct message when successfully update build failure status', (done) => {
        mockRequest.yieldsAsync(null, { statusCode: 200 });

        helper.updateBuildStatus(
            fullBuildConfig.buildConfig,
            status,
            statusMessage,
            (err) => {
                assert.calledWith(mockRequest, requestOptions);
                assert.isNull(err);
                done();
            });
    });

    it('logs correct message when fail to update build failure status', (done) => {
        const requestErr = new Error('failed to update');
        const response = {};

        mockRequest.yieldsAsync(requestErr, response);

        helper.updateBuildStatus(
            fullBuildConfig.buildConfig,
            status,
            statusMessage,
            (err) => {
                assert.calledWith(mockRequest, requestOptions);
                assert.strictEqual(err.message, 'failed to update');
                done();
            });
    });
});
