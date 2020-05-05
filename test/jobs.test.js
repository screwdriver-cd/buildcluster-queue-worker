'use strict';

const assert = require('chai').assert;
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
    let mockExecutorK8s;
    let mockExecutorK8sVm;
    let mockExecutorRouter;
    let mockConfig;
    let mockEcosystemConfig;
    let mockExecutorConfig;
    let routerFuncs;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        mockExecutorK8s = {
            start: sinon.stub(),
            stop: sinon.stub(),
            name: 'k8s-vm'
        };
        mockExecutorK8sVm = {
            start: sinon.stub(),
            stop: sinon.stub(),
            name: 'k8s'
        };

        routerFuncs = {
            executorFunc: type => (type === 'k8s' ? mockExecutorK8s : mockExecutorK8sVm),
            mockRouterfunc: (config, defaultExecutor) => {
                const executorType = config.annotations
                    && config.annotations['beta.screwdriver.cd/executor'];

                return executorType ? routerFuncs.executorFunc(executorType) : defaultExecutor;
            }
        };
        mockExecutor = {
            start: (config) => {
                const executor = routerFuncs.mockRouterfunc(config, mockExecutor.defaultExecutor);

                return executor.start(config);
            },
            stop: (config) => {
                const executor = routerFuncs.mockRouterfunc(config, mockExecutor.defaultExecutor);

                return executor.stop(config);
            },
            defaultExecutor: null
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

            mockExecutorRouter = function (routerConfig) {
                if (routerConfig.defaultPlugin) {
                    mockExecutor.defaultExecutor =
                        routerFuncs.executorFunc(routerConfig.defaultPlugin);
                }

                return mockExecutor;
            };
            mockery.registerMock('screwdriver-executor-router', mockExecutorRouter);
            // eslint-disable-next-line global-require
            jobs = require('../lib/jobs.js');
        });
        it('starts a job', () => {
            mockExecutorK8s.start.resolves(null);
            const job = `jobId: ${fullBuildConfig.buildConfig.buildId}, ` +
                `jobType: 'start', buildId: ${fullBuildConfig.buildConfig.buildId}`;

            return jobs(['start', fullBuildConfig.buildConfig, job])
                .then(() => {
                    assert.notCalled(mockExecutorK8sVm.start);
                    assert.calledWith(mockExecutorK8s.start, fullBuildConfig.buildConfig);
                });
        });

        it('stops a job', () => {
            mockExecutorK8s.stop.resolves(null);
            const job = `jobId: ${fullBuildConfig.buildConfig.buildId}, ` +
                `jobType: 'stop', buildId: ${fullBuildConfig.buildConfig.buildId}`;

            return jobs(['stop', fullBuildConfig.buildConfig, job])
                .then(() => {
                    assert.notCalled(mockExecutorK8sVm.stop);
                    assert.calledWith(mockExecutorK8s.stop, fullBuildConfig.buildConfig);
                });
        });

        it('invalid jobType', () => {
            mockExecutorK8s.start.resolves(null);
            mockExecutorK8s.stop.resolves(null);
            const job = `jobId: ${fullBuildConfig.buildConfig.buildId}, ` +
                `jobType: 's', buildId: ${fullBuildConfig.buildConfig.buildId}`;

            return jobs(['s', fullBuildConfig.buildConfig, job])
                .then(() => {
                    assert.notCalled(mockExecutorK8s.start);
                    assert.notCalled(mockExecutorK8s.stop);
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

            mockExecutorRouter = function (routerConfig) {
                if (routerConfig.defaultPlugin) {
                    mockExecutor.defaultExecutor =
                        routerFuncs.executorFunc(routerConfig.defaultPlugin);
                }

                return mockExecutor;
            };
            mockery.registerMock('screwdriver-executor-router', mockExecutorRouter);

            // eslint-disable-next-line global-require
            jobs = require('../lib/jobs.js');
        });
        it('starts a job with k8s weighted executor', () => {
            mockExecutorK8s.start.resolves(null);
            const job = `jobId: ${anotherBuildConfig.buildConfig.buildId}, ` +
                `jobType: 'start', buildId: ${anotherBuildConfig.buildConfig.buildId}`;

            return jobs(['start', anotherBuildConfig.buildConfig, job])
                .then(() => {
                    assert.notCalled(mockExecutorK8sVm.start);
                    assert.calledWith(mockExecutorK8s.start, anotherBuildConfig.buildConfig);
                });
        });

        it('starts a job with executor annotations k8s-vm and not weighted', () => {
            mockExecutorK8sVm.start.resolves(null);
            const overrideBuildConfig = Object.assign(anotherBuildConfig.buildConfig, {
                annotations: {
                    'beta.screwdriver.cd/executor': 'k8s-vm'
                }
            });
            const job = `jobId: ${overrideBuildConfig.buildId}, ` +
                `jobType: 'start', buildId: ${overrideBuildConfig.buildId}`;

            return jobs(['start', overrideBuildConfig, job])
                .then(() => {
                    assert.notCalled(mockExecutorK8s.start);
                    assert.calledWith(mockExecutorK8sVm.start, overrideBuildConfig);
                });
        });
    });
});
