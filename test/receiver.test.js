'use strict';

const chai = require('chai');
const { assert } = chai;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(chai.assert, { prefix: '' });

describe('rabbitmq message consumer', async () => {
    let requestMock;
    let helperMock;
    let retryQMock;
    let configMock;
    let ampqConnMock;
    let connection;

    const configObj = {
        ecosystem: {
            cache: {
                strategy: 's3',
                path: '/'
            }
        },
        rabbitmq: {
            protocol: 'amqp',
            username: 'foo',
            password: 'bar',
            host: '127.0.0.1',
            port: 5672,
            vhost: '/screwdriver',
            connectOptions: {
                json: true,
                heartbeatIntervalInSeconds: 20,
                reconnectTimeInSeconds: 30
            },
            queue: 'test',
            prefetchCount: 20,
            messageReprocessLimit: 3,
            retryQueue: 'rq',
            retryQueueEnabled: true
        }
    };

    class AmqpConnectionMock {
        connect() {
            return {
                on: sinon.stub().resolves(),
                createChannel: sinon.stub().returns({
                    publish: sinon.stub().resolves(),
                    waitForConnect: sinon.stub().resolves()
                })
            };
        }
    }

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });
    after(() => {
        mockery.disable();
    });
    describe('rabbitmq message consumer test', async () => {
        beforeEach(async () => {
            retryQMock = {
                push: sinon.stub()
            };
            configMock = {
                getConfig: () => configObj
            };
            ampqConnMock = new AmqpConnectionMock();
            requestMock = sinon.stub();

            mockery.registerMock('./lib/config', configMock);
            mockery.registerMock('request', requestMock);
            mockery.registerMock('amqp-connection-manager', ampqConnMock);
            mockery.registerMock('./lib/helper', helperMock);
            mockery.registerMock('./lib/retry-queue', retryQMock);

            /* eslint-disable global-require */
            const receiver = require('../receiver');

            connection = await receiver.listen();
        });

        afterEach(() => {
            mockery.deregisterAll();
            mockery.resetCache();
            process.removeAllListeners('SIGTERM');
            connection = null;
        });
        it('creates a rabbitmq connection', async () => {
            try {
                assert.calledTwice(connection.on);
                assert.notEqual(connection.createChannel, null);
            } catch (error) {
                throw new Error('should not fail');
            }
        });

        it('calls create channel and waits for connection', async () => {
            try {
                assert.calledTwice(connection.on);
                assert.calledOnce(connection.createChannel);
                assert.calledOnce(connection.createChannel().waitForConnect);
            } catch (error) {
                throw new Error('should not fail');
            }
        });

        it('does not call publish messages', async () => {
            try {
                assert.notCalled(connection.createChannel().publish);
            } catch (error) {
                throw new Error('should not fail');
            }
        });
    });
    describe('rabbitmq message consumer test with retry disabled', async () => {
        beforeEach(async () => {
            retryQMock = {
                push: sinon.stub()
            };
            configObj.rabbitmq.retryQueueEnabled = false;
            configMock = {
                getConfig: () => configObj
            };
            ampqConnMock = new AmqpConnectionMock();
            requestMock = sinon.stub();

            mockery.registerMock('./lib/config', configMock);
            mockery.registerMock('request', requestMock);
            mockery.registerMock('amqp-connection-manager', ampqConnMock);
            mockery.registerMock('./lib/helper', helperMock);
            mockery.registerMock('./lib/retry-queue', retryQMock);

            /* eslint-disable global-require */
            const receiver = require('../receiver');

            connection = await receiver.listen();
        });

        afterEach(() => {
            mockery.deregisterAll();
            mockery.resetCache();
            process.removeAllListeners('SIGTERM');
            connection = null;
        });
        it('creates a rabbitmq connection', async () => {
            try {
                assert.calledTwice(connection.on);
                assert.notEqual(connection.createChannel, null);
            } catch (error) {
                throw new Error('should not fail');
            }
        });

        it('calls create channel and waits for connection', async () => {
            try {
                assert.calledTwice(connection.on);
                assert.calledOnce(connection.createChannel);
                assert.calledOnce(connection.createChannel().waitForConnect);
            } catch (error) {
                throw new Error('should not fail');
            }
        });

        it('does not call publish messages', async () => {
            try {
                assert.notCalled(connection.createChannel().publish);
            } catch (error) {
                throw new Error('should not fail');
            }
        });
    });
});
