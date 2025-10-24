'use strict';

const chai = require('chai');
const { assert } = chai;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(chai.assert, { prefix: '' });

describe('rabbitmq message producer test', async () => {
    let mockRabbitmqCh;
    let mockRabbitmqConnection;
    let mockAmqp;
    let RQ;
    let mockRabbitmqConfig;
    let mockRabbitmqConfigObj;
    let mockLogger;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(async () => {
        mockRabbitmqCh = {
            publish: sinon.stub().resolves(null),
            assertExchange: sinon.stub().resolves(null),
            close: sinon.stub().resolves(null)
        };

        mockRabbitmqConnection = {
            on: sinon.stub(),
            createChannel: sinon.stub().returns(mockRabbitmqCh)
        };

        mockAmqp = {
            connect: sinon.stub().returns(mockRabbitmqConnection)
        };

        mockRabbitmqConfigObj = {
            schedulerMode: false,
            amqpURI: 'amqp://localhost:5672',
            exchange: 'build',
            connectOptions: '{ json: true, hb: 20, reconnectTimeInSeconds: 30 }',
            retryQueue: 'retryQ',
            retryDelayedQueue: 'retryQ-wait',
            retryQueueEnabled: true,
            retryDelay: 30 // 30 seconds
        };

        mockRabbitmqConfig = {
            getConfig: sinon.stub().returns(mockRabbitmqConfigObj)
        };

        mockLogger = {
            info: sinon.stub(),
            error: sinon.stub()
        };

        mockery.registerMock('amqp-connection-manager', mockAmqp);
        mockery.registerMock('screwdriver-logger', mockLogger);
        mockery.registerMock('./config', mockRabbitmqConfig);

        /* eslint-disable global-require */
        RQ = require('../lib/retry-queue');
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
        process.removeAllListeners('SIGTERM');
    });

    after(() => {
        mockery.disable();
    });

    describe('push', async () => {
        let amqpURI;
        let exchange;
        let connectOptions;
        let retryDelayedQueue;
        let retryDelay;

        it('publish to rabbitmq for valid config and retry queue enabled', async () => {
            const buildConfig = {
                id: 123,
                token: '1212'
            };

            ({ amqpURI, exchange, connectOptions, retryDelayedQueue, retryDelay } = mockRabbitmqConfigObj);

            await RQ.push(buildConfig, '1243');

            assert.calledWith(mockAmqp.connect, [amqpURI], connectOptions);
            assert.calledOnce(mockRabbitmqConnection.createChannel);
            assert.calledWith(
                mockRabbitmqCh.publish,
                exchange,
                retryDelayedQueue,
                { buildConfig, job: 'verify' },
                sinon.match({
                    contentType: 'application/json',
                    persistent: true,
                    headers: sinon.match.object,
                    expiration: String(retryDelay * 1000)
                })
            );
            assert.calledOnce(mockRabbitmqCh.close);
        });

        it('publishes with custom delay for progressive backoff', async () => {
            const buildConfig = {
                id: 123,
                token: '1212'
            };

            ({ amqpURI, exchange, connectOptions, retryDelayedQueue } = mockRabbitmqConfigObj);

            // Test 40s delay (second retry for image pull)
            await RQ.push(buildConfig, '1243', 40000);

            assert.calledWith(
                mockRabbitmqCh.publish,
                exchange,
                retryDelayedQueue,
                { buildConfig, job: 'verify' },
                sinon.match({
                    contentType: 'application/json',
                    persistent: true,
                    headers: sinon.match.object,
                    expiration: '40000'
                })
            );
        });

        it('publishes with retry count in headers', async () => {
            const buildConfig = {
                id: 123,
                token: '1212'
            };

            ({ amqpURI, exchange, connectOptions, retryDelayedQueue, retryDelay } = mockRabbitmqConfigObj);

            await RQ.push(buildConfig, '1243', 30000, 3);

            assert.calledWith(
                mockRabbitmqCh.publish,
                exchange,
                retryDelayedQueue,
                { buildConfig, job: 'verify' },
                sinon.match({
                    contentType: 'application/json',
                    persistent: true,
                    headers: sinon.match({
                        'x-retry-count': 3
                    }),
                    expiration: String(retryDelay * 1000)
                })
            );
        });

        it('publishes with build start time in headers', async () => {
            const buildConfig = {
                id: 123,
                token: '1212'
            };
            const buildStartTime = Date.now() - 60000; // 1 minute ago

            ({ amqpURI, exchange, connectOptions, retryDelayedQueue, retryDelay } = mockRabbitmqConfigObj);

            await RQ.push(buildConfig, '1243', 30000, 2, buildStartTime);

            assert.calledWith(
                mockRabbitmqCh.publish,
                exchange,
                retryDelayedQueue,
                { buildConfig, job: 'verify' },
                sinon.match({
                    contentType: 'application/json',
                    persistent: true,
                    headers: sinon.match({
                        'x-retry-count': 2,
                        'x-build-start-time': buildStartTime
                    }),
                    expiration: String(retryDelay * 1000)
                })
            );
        });

        it('creates new build start time if not provided', async () => {
            const buildConfig = {
                id: 123,
                token: '1212'
            };

            ({ amqpURI, exchange, connectOptions } = mockRabbitmqConfigObj);

            await RQ.push(buildConfig, '1243', 30000, 0, null);

            // Verify that x-build-start-time header exists and is a number
            const publishCall = mockRabbitmqCh.publish.getCall(0);
            const { headers } = publishCall.args[3];

            assert.isDefined(headers['x-build-start-time']);
            assert.isNumber(headers['x-build-start-time']);
            assert.isAbove(headers['x-build-start-time'], 0);
        });

        it('publishes with progressive backoff delays for image pull retries', async () => {
            const buildConfig = {
                id: 123,
                token: '1212'
            };

            ({ amqpURI, exchange, connectOptions, retryDelayedQueue } = mockRabbitmqConfigObj);

            // Test delays: 30s, 40s, 50s, 60s, 70s, 80s
            const expectedDelays = [30000, 40000, 50000, 60000, 70000, 80000];

            for (let i = 0; i < expectedDelays.length; i += 1) {
                mockRabbitmqCh.publish.resetHistory();
                mockRabbitmqCh.close.resetHistory();

                await RQ.push(buildConfig, '1243', expectedDelays[i], i);

                assert.calledWith(
                    mockRabbitmqCh.publish,
                    exchange,
                    retryDelayedQueue,
                    { buildConfig, job: 'verify' },
                    sinon.match({
                        contentType: 'application/json',
                        persistent: true,
                        headers: sinon.match({
                            'x-retry-count': i
                        }),
                        expiration: String(expectedDelays[i])
                    })
                );
            }
        });

        it('custom delay parameter overrides config default', async () => {
            const buildConfig = {
                id: 123,
                token: '1212'
            };

            // Config has default retryDelay, but we pass 50000ms explicitly
            ({ amqpURI, exchange, connectOptions, retryDelayedQueue } = mockRabbitmqConfigObj);

            await RQ.push(buildConfig, '1243', 50000);

            assert.calledWith(
                mockRabbitmqCh.publish,
                exchange,
                retryDelayedQueue,
                { buildConfig, job: 'verify' },
                sinon.match({
                    contentType: 'application/json',
                    persistent: true,
                    headers: sinon.match.object,
                    expiration: '50000' // Uses explicit parameter, not config default
                })
            );
        });
    });

    describe('dont push', async () => {
        let rQ;

        before(() => {
            mockery.deregisterMock('./config');

            mockRabbitmqConfigObj.retryQueueEnabled = false;
            mockRabbitmqConfig.getConfig.returns(mockRabbitmqConfigObj);

            mockery.registerMock('./config', mockRabbitmqConfig);
            mockery.registerMock('amqp-connection-manager', mockAmqp);
            mockery.registerMock('screwdriver-logger', mockLogger);

            /* eslint-disable global-require */
            rQ = require('../lib/retry-queue');
        });
        it('do not publish to rabbitmq if retry queue not enabled', async () => {
            mockRabbitmqConfigObj.schedulerMode = true;
            mockRabbitmqConfig.getConfig.returns(mockRabbitmqConfigObj);
            const buildConfig = { id: 123, token: 'absdc' };

            await rQ.push(buildConfig, '1243');

            assert.notCalled(mockRabbitmqConnection.createChannel);
            assert.notCalled(mockRabbitmqCh.publish);
            assert.notCalled(mockRabbitmqCh.close);
        });
    });
});
