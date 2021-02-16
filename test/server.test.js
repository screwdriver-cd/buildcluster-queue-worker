'use strict';

const assert = require('chai').assert;
const init = require('../lib/server');

const serverConfig = {
    port: 80,
    host: '0.0.0.0'
};

describe('GET /status', () => {
    let server;
    const requestParam = {
        method: 'get',
        url: '/status'
    };

    beforeEach(async () => {
        server = await init(serverConfig);
    });

    afterEach(async () => {
        await server.stop();
    });

    it('responds with 200', async () => {
        const res = await server.inject(requestParam);

        assert.equal(res.statusCode, 200);
    });
});

describe('GET /health', () => {
    let server;
    const requestParam = {
        method: 'get',
        url: '/health'
    };

    class AmqpConnectionMock {
        constructor(status) {
            this.status = status;
        }

        isConnected() {
            return this.status;
        }
    }

    afterEach(async () => {
        await server.stop();
    });

    it('responds with 200', async () => {
        const amqpConnection = new AmqpConnectionMock(true);

        server = await init(serverConfig, amqpConnection);
        const res = await server.inject(requestParam);

        assert.equal(res.statusCode, 200);
    });

    it('responds with 503', async () => {
        const amqpConnection = new AmqpConnectionMock(false);

        server = await init(serverConfig, amqpConnection);
        const res = await server.inject(requestParam);

        assert.equal(res.statusCode, 503);
    });
});
