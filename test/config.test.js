'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('config test', () => {
    const configDef = {
        ecosystem: {
            cache: {
                strategy: 'disk',
                path: '/persistent_cache'
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
            queueOptions: {
                durable: true,
                autodelete: false,
                deadLetterExchange: 'build',
                deadLetterRoutingKey: 'test_retry'
            },
            prefetchCount: 20,
            messageReprocessLimit: 3
        }
    };

    let configMock;
    let config;

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
        configMock.get.withArgs('rabbitmq').returns(configDef.rabbitmq);
        configMock.get.withArgs('ecosystem').returns(configDef.ecosystem);
        // eslint-disable-next-line global-require
        config = require('../lib/config');
    });

    it('populates the correct values', () => {
        assert.deepEqual(config.getConfig(), {
            amqpURI: 'amqp://foo:bar@127.0.0.1:5672/screwdriver',
            host: configDef.rabbitmq.host,
            connectOptions: configDef.rabbitmq.connectOptions,
            queue: configDef.rabbitmq.queue,
            queueOptions: configDef.rabbitmq.queueOptions,
            prefetchCount: configDef.rabbitmq.prefetchCount,
            messageReprocessLimit: configDef.rabbitmq.messageReprocessLimit,
            cacheStrategy: configDef.ecosystem.cache.strategy,
            cachePath: configDef.ecosystem.cache.path
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
