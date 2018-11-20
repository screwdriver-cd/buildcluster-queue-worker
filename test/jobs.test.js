'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Jobs Test', () => {
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

    let jobs;
    let mockExecutor;
    let mockExecutorRouter;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        mockExecutor = {
            start: sinon.stub(),
            stop: sinon.stub()
        };

        mockExecutorRouter = function () { return mockExecutor; };
        mockery.registerMock('screwdriver-executor-router', mockExecutorRouter);

        // eslint-disable-next-line global-require
        jobs = require('../lib/jobs.js');
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
        process.removeAllListeners('SIGTERM');
    });

    after(() => {
        mockery.disable();
    });

    it('starts a job', () => {
        mockExecutor.start.resolves(null);
        const job = `jobId: ${fullBuildConfig.buildConfig.buildId}, ` +
            `jobType: 'start', buildId: ${fullBuildConfig.buildConfig.buildId}`;

        return jobs(['start', fullBuildConfig.buildConfig, job])
            .then(() => {
                assert.calledWith(mockExecutor.start, fullBuildConfig.buildConfig);
            });
    });

    it('stops a job', () => {
        mockExecutor.stop.resolves(null);
        const job = `jobId: ${fullBuildConfig.buildConfig.buildId}, ` +
            `jobType: 'stop', buildId: ${fullBuildConfig.buildConfig.buildId}`;

        return jobs(['stop', fullBuildConfig.buildConfig, job])
            .then(() => {
                assert.calledWith(mockExecutor.stop, fullBuildConfig.buildConfig);
            });
    });

    it('invalid jobType', () => {
        mockExecutor.start.resolves(null);
        mockExecutor.stop.resolves(null);
        const job = `jobId: ${fullBuildConfig.buildConfig.buildId}, ` +
            `jobType: 's', buildId: ${fullBuildConfig.buildConfig.buildId}`;

        return jobs(['s', fullBuildConfig.buildConfig, job])
            .then(() => {
                assert.notCalled(mockExecutor.start);
                assert.notCalled(mockExecutor.stop);
            });
    });
});
