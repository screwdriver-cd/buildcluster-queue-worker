'use strict';

const { assert } = require('chai');
const mockery = require('mockery');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');

sinon.assert.expose(assert, { prefix: '' });

/**
 * Load sample data from disk
 * @method loadData
 * @param  {String} name Filename to read (inside data dir)
 * @return {String}      Contents of file
 */
function loadData(name) {
    return fs.readFileSync(path.join(__dirname, 'data', name), 'utf-8');
}

describe('Helper Test', () => {
    const fullBuildConfig = JSON.parse(loadData('buildConfig.json'));
    const status = 'FAILURE';
    const statusMessage = 'exhausted retries';
    const requestOptions = {
        context: { token: 'fake', caller: 'updateBuildStatusAsync' },
        method: 'PUT',
        json: {
            status,
            statusMessage
        },
        url: `foo.bar/v4/builds/${fullBuildConfig.buildConfig.buildId}`
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
        mockery.registerMock('screwdriver-request', mockRequest);

        // eslint-disable-next-line global-require
        helper = require('../lib/helper');
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
        process.removeAllListeners('SIGTERM');
    });

    after(() => {
        mockery.disable();
    });

    it('logs correct message when successfully update build failure status', async () => {
        mockRequest.resolves({ statusCode: 200 });

        await helper.updateBuildStatusAsync(fullBuildConfig.buildConfig, status, statusMessage);

        assert.calledWith(mockRequest, requestOptions);
    });

    it('logs correct message when fail to update build failure status', async () => {
        const requestErr = new Error('failed to update');

        mockRequest.rejects(requestErr);

        try {
            await helper.updateBuildStatusAsync(fullBuildConfig.buildConfig, status, statusMessage);
        } catch (err) {
            assert.calledWith(mockRequest, requestOptions);
            assert.strictEqual(err.message, 'failed to update');
        }
    });
});
