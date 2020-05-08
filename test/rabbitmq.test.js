'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('rabbitmq config test', () => {
    const rabbitmq = {
        protocol: 'amqp',
        username: 'foo',
        password: 'bar',
        host: '127.0.0.1',
        port: 5672,
        vhost: '/screwdriver',
        connectOptions: { json: true, heartbeatIntervalInSeconds: 20, reconnectTimeInSeconds: 30 },
        queue: 'test',
        queueOptions: {
            durable: true,
            autodelete: false,
            deadLetterExchange: 'build',
            deadLetterRoutingKey: 'test_retry'
        },
        prefetchCount: 20,
        messageReprocessLimit: 3
    };

    let configMock;
    let rabbitmqConfig;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        configMock = {
            get: sinon.stub()
        };

        mockery.registerMock('config', configMock);
        configMock.get.withArgs('rabbitmq').returns(rabbitmq);
        // eslint-disable-next-line global-require
        rabbitmqConfig = require('../config/rabbitmq');
    });

    it('populates the correct values', () => {
        assert.deepEqual(rabbitmqConfig.getConfig(), {
            amqpURI: 'amqp://foo:bar@127.0.0.1:5672/screwdriver',
            host: rabbitmq.host,
            connectOptions: rabbitmq.connectOptions,
            queue: rabbitmq.queue,
            queueOptions: rabbitmq.queueOptions,
            prefetchCount: rabbitmq.prefetchCount,
            messageReprocessLimit: rabbitmq.messageReprocessLimit
        });
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });
});
