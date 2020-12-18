'use strict';

const assert = require('chai').assert;

describe('config test', () => {
    const configDef = {
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
            messageReprocessLimit: 3
        }
    };

    let config;

    beforeEach(() => {
        // eslint-disable-next-line global-require
        config = require('../lib/config');
    });

    it('populates the correct values', () => {
        assert.deepEqual(config.getConfig(), {
            amqpURI: 'amqp://foo:bar@127.0.0.1:5672/screwdriver',
            host: configDef.rabbitmq.host,
            connectOptions: configDef.rabbitmq.connectOptions,
            queue: configDef.rabbitmq.queue,
            prefetchCount: configDef.rabbitmq.prefetchCount,
            messageReprocessLimit: configDef.rabbitmq.messageReprocessLimit,
            cacheStrategy: configDef.ecosystem.cache.strategy,
            cachePath: configDef.ecosystem.cache.path
        });
    });
});
