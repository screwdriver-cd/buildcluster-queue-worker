'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const fs = require('fs-extra');
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

describe('Cache Test', () => {
    // mock fs
    let mockFs;
    let cache;
    let helper;

    /**
     * get message properties type as json and id
     * @method getData
     * @param  {json}   data  json data
     * @return {array}        message properties type as json, id
     */
    function getData(data) {
        const fullBuildConfig = data.content;
        const buildConfig = fullBuildConfig.buildConfig;
        const messageProperties = helper.getMessageProperties(data.properties);
        const type = messageProperties.get('type');
        let id = '';

        switch (type.entity) {
        case 'pipelines':
            id = buildConfig.pipelineId;
            break;
        case 'jobs':
            id = buildConfig.jobId;
            break;
        default:
            break;
        }

        return [type, id];
    }

    /**
     * sinon stub fs remove method return based on param p
     * @method stubFs
     * @param  {p}      Promise  promise.resolve() or promise.reject('err')
     */
    function stubFs(p) {
        mockFs.returns(p);
    }

    /**
     * common function to test scenarios
     * @method test
     * @param  {data}   json data to test
     * @param  {p}      Promise  promise.resolve() or promise.reject('err')
     */
    function test(data, p) {
        const cacheStrategy = 'disk';
        const cachePath = '/persistent_cache';
        const result = getData(data);
        const type = result[0];
        const id = result[1];
        const job = `jobType: ${type.resource}, action: ${type.action}, ` +
            `cacheStrategy: ${cacheStrategy}, cachePath: ${cachePath}, ` +
            ` prefix: ${type.prefix}, entity: ${type.entity}, ` +
            ` id: ${id}`;

        stubFs(p);

        if (p === Promise.resolve()) {
            return cache([job, cachePath, type.prefix, type.entity, id])
                .then((ok) => {
                    assert.ok(ok);
                });
        }

        return cache([job, cachePath, type.prefix, type.entity, id])
            .catch((err) => {
                assert.deepEqual(err, 'error deleting directory');
            });
    }

    beforeEach(function () {
        mockFs = sinon.stub(fs, 'remove');
        // eslint-disable-next-line global-require
        cache = require('../lib/cache.js');
        // eslint-disable-next-line global-require
        helper = require('../lib/helper.js');
    });

    afterEach(function () {
        sinon.restore();
    });

    it('returns promise after deleting directory for pipeline', (done) => {
        const data = JSON.parse(loadData('pipelineDeleteCacheConfig.json'));

        test(data, Promise.resolve());
        done();
    });

    it('returns err deleting directory for pipeline', (done) => {
        const data = JSON.parse(loadData('pipelineDeleteCacheConfig.json'));

        test(data, Promise.reject('error deleting directory'));
        done();
    });

    it('returns promise after deleting directory for job', (done) => {
        const data = JSON.parse(loadData('jobDeleteCacheConfig.json'));

        test(data, Promise.resolve());
        done();
    });

    it('returns err deleting directory for job', (done) => {
        const data = JSON.parse(loadData('jobDeleteCacheConfig.json'));

        test(data, Promise.reject('error deleting directory'));
        done();
    });

    it('returns promise after deleting directory for pipeline with prefix beta-', (done) => {
        const data = JSON.parse(loadData('betaPipelineDeleteCacheConfig.json'));

        test(data, Promise.resolve());
        done();
    });
});
