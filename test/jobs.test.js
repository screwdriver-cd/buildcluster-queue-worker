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

describe('Jobs Test', () => {
    const fullBuildConfig = JSON.parse(loadData('buildConfig.json'));
    const anotherBuildConfig = JSON.parse(loadData('anotherBuildConfig.json'));
    let jobs;
    let mockExecutor;
    let mockExecutorRouter;
    let mockConfig;
    let mockEcosystemConfig;
    let mockExecutorConfig;

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

        mockExecutorRouter = function () {
            return mockExecutor;
        };

        mockEcosystemConfig = {
            ui: 'foo.ui',
            api: 'foo.api',
            store: 'foo.store',
            cache: {
                strategy: 's3',
                path: '/',
                compress: false,
                md5check: false,
                max_size_mb: 0
            }
        };
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
        process.removeAllListeners('SIGTERM');
    });

    after(() => {
        mockery.disable();
    });

    describe('Regular executor config with no weightage', () => {
        beforeEach(() => {
            mockExecutorConfig = JSON.parse(loadData('executorConfig.json'));
            mockConfig = {
                get: sinon.stub()
            };

            mockery.registerMock('config', mockConfig);
            mockConfig.get.withArgs('executor').returns(mockExecutorConfig);
            mockConfig.get.withArgs('ecosystem').returns(mockEcosystemConfig);

            mockery.registerMock('screwdriver-executor-router', mockExecutorRouter);
            // eslint-disable-next-line global-require
            jobs = require('../lib/jobs');
        });
        it('starts a job', () => {
            mockExecutor.start.resolves(null);
            const job =
                `jobId: ${fullBuildConfig.buildConfig.buildId}, ` +
                `jobType: 'start', buildId: ${fullBuildConfig.buildConfig.buildId}`;

            return jobs(['start', fullBuildConfig.buildConfig, job]).then(() => {
                assert.calledWith(mockExecutor.start, fullBuildConfig.buildConfig);
            });
        });

        it('stops a job', () => {
            mockExecutor.stop.resolves(null);
            const job =
                `jobId: ${fullBuildConfig.buildConfig.buildId}, ` +
                `jobType: 'stop', buildId: ${fullBuildConfig.buildConfig.buildId}`;

            return jobs(['stop', fullBuildConfig.buildConfig, job]).then(() => {
                assert.calledWith(mockExecutor.stop, fullBuildConfig.buildConfig);
            });
        });

        it('invalid jobType', () => {
            mockExecutor.start.resolves(null);
            mockExecutor.stop.resolves(null);
            const job =
                `jobId: ${fullBuildConfig.buildConfig.buildId}, ` +
                `jobType: 's', buildId: ${fullBuildConfig.buildConfig.buildId}`;

            return jobs(['s', fullBuildConfig.buildConfig, job]).then(() => {
                assert.notCalled(mockExecutor.start);
                assert.notCalled(mockExecutor.stop);
            });
        });
        it('starts a job with default plugin when no weight and no annotation present', () => {
            mockExecutor.start.resolves(null);
            const overrideBuildConfig = fullBuildConfig.buildConfig;

            delete overrideBuildConfig.annotations;
            const job = `jobId: ${overrideBuildConfig.buildId}, jobType: 'start', buildId: ${overrideBuildConfig.buildId}`;

            return jobs(['start', overrideBuildConfig, job]).then(() => {
                assert.calledWith(mockExecutor.start, overrideBuildConfig);
            });
        });
    });

    describe('Executor config with weightage', () => {
        beforeEach(() => {
            mockExecutorConfig = JSON.parse(loadData('executorConfigWeightage.json'));
            mockConfig = {
                get: sinon.stub()
            };

            mockery.deregisterMock('config');
            mockery.deregisterMock('screwdriver-executor-router');

            mockery.registerMock('config', mockConfig);
            mockConfig.get.withArgs('executor').returns(mockExecutorConfig);
            mockConfig.get.withArgs('ecosystem').returns(mockEcosystemConfig);

            mockery.registerMock('screwdriver-executor-router', mockExecutorRouter);

            // eslint-disable-next-line global-require
            jobs = require('../lib/jobs');
        });
        it('starts a job with weighted executor randomly', () => {
            mockExecutor.start.resolves('k8sresult');
            const job =
                `jobId: ${anotherBuildConfig.buildConfig.buildId}, ` +
                `jobType: 'start', buildId: ${anotherBuildConfig.buildConfig.buildId}`;

            return jobs(['start', anotherBuildConfig.buildConfig, job]).then(result => {
                assert.deepEqual(result, 'k8sresult');
                assert.calledWith(mockExecutor.start, anotherBuildConfig.buildConfig);
            });
        });

        it('starts a job with executor annotations k8s-test and not weighted', () => {
            mockExecutor.start.resolves(null);
            const overrideBuildConfig = Object.assign(anotherBuildConfig.buildConfig, {
                annotations: {
                    'beta.screwdriver.cd/executor': 'k8s-test'
                }
            });
            const job = `jobId: ${overrideBuildConfig.buildId}, jobType: 'start', buildId: ${overrideBuildConfig.buildId}`;

            return jobs(['start', overrideBuildConfig, job]).then(() => {
                assert.calledWith(mockExecutor.start, overrideBuildConfig);
            });
        });
    });
});
