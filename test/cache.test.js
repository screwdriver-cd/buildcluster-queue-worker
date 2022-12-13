'use strict';

const { assert } = require('chai');
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
        const cachePath = '/persistent_cache';
        let dir2Clean = data.prefix !== '' ? `${cachePath}/${data.prefix}` : `${cachePath}`;

        dir2Clean = `${dir2Clean}/${data.scope}/${data.pipelineId}`;

        if (data.scope !== 'pipelines') {
            dir2Clean = `${dir2Clean}/${data.id}`;
        }

        stubFs(p);

        if (p === Promise.resolve()) {
            return cache([dir2Clean]).then(ok => {
                assert.ok(ok);
            });
        }

        return cache([dir2Clean]).catch(err => {
            assert.deepEqual(err.message, 'error deleting directory');
        });
    }

    beforeEach(function () {
        mockFs = sinon.stub(fs, 'remove');
        // eslint-disable-next-line global-require
        cache = require('../lib/cache');
    });

    afterEach(function () {
        sinon.restore();
    });

    it('returns promise after deleting directory for pipeline', done => {
        const data = JSON.parse(loadData('pipelineDeleteCacheConfig.json'));

        test(data, Promise.resolve());
        done();
    });

    it('returns err deleting directory for pipeline', done => {
        const data = JSON.parse(loadData('pipelineDeleteCacheConfig.json'));

        test(data, Promise.reject(new Error('error deleting directory')));
        done();
    });

    it('returns promise after deleting directory for job', done => {
        const data = JSON.parse(loadData('jobDeleteCacheConfig.json'));

        test(data, Promise.resolve());
        done();
    });

    it('returns err deleting directory for job', done => {
        const data = JSON.parse(loadData('jobDeleteCacheConfig.json'));

        test(data, Promise.reject(new Error('error deleting directory')));
        done();
    });

    it('returns promise after deleting directory for pipeline with prefix beta-', done => {
        const data = JSON.parse(loadData('betaPipelineDeleteCacheConfig.json'));

        test(data, Promise.resolve());
        done();
    });
});
