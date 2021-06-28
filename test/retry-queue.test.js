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
            retryQueueEnabled: true
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

        it('publish to rabbitmq for valid config and retry queue enabled', async () => {
            const buildConfig = {
                id: 123,
                token: '1212'
            };

            ({ amqpURI, exchange, connectOptions } = mockRabbitmqConfigObj);

            await RQ.push(buildConfig, '1243');

            assert.calledWith(mockAmqp.connect, [amqpURI], connectOptions);
            assert.calledOnce(mockRabbitmqConnection.createChannel);
            assert.calledWith(
                mockRabbitmqCh.publish,
                exchange,
                'retryQ',
                { buildConfig, job: 'verify' },
                {
                    contentType: 'application/json',
                    persistent: true
                }
            );
            assert.calledOnce(mockRabbitmqCh.close);
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
