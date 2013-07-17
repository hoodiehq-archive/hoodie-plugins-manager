var plugins_manager = require('../lib/index'),
    couchr = require('couchr'),
    utils = require('./lib/utils'),
    async = require('async'),
    url = require('url'),
    _ = require('underscore');

//require('long-stack-traces');


var COUCH = {
    user: 'admin',
    pass: 'password',
    url: 'http://localhost:8985',
    data_dir: __dirname + '/data',
};

var DEFAULT_OPTIONS = {
    couchdb: COUCH
};

exports.setUp = function (callback) {
    var that = this;
    utils.setupCouch(COUCH, function (err, couch) {
        if (err) {
            return callback(err);
        }
        that.couch = couch;

        var base = url.parse(COUCH.url);
        base.auth = COUCH.user + ':' + COUCH.pass;
        base = url.format(base);

        that.base_url = base;

        var appconfig = {
            config: {foo: 'bar'}
        };
        async.series([
            async.apply(couchr.put, url.resolve(base, 'plugins')),
            async.apply(couchr.put, url.resolve(base, 'app')),
            async.apply(couchr.put, url.resolve(base, 'app/config'), appconfig)
        ],
        callback);
    });
};

exports.tearDown = function (callback) {
    this.couch.once('stop', callback);
    this.couch.stop();
};

exports['get config values from plugin manager'] = function (test) {
    var plugin_url = url.resolve(this.base_url, 'plugins/plugin%2Fmyplugin');
    var doc = {
        config: {asdf: 123}
    };
    couchr.put(plugin_url, doc, function (err) {
        if (err) {
            return test.done(err);
        }
        plugins_manager.start(DEFAULT_OPTIONS, function (err, manager) {
            if (err) {
                return test.done(err);
            }
            var hoodie = manager.createAPI({name: 'myplugin'});
            test.equal(hoodie.config.get('foo'), 'bar');
            test.equal(hoodie.config.get('asdf'), 123);
            manager.stop(test.done);
        });
    });
};

exports['automatically update plugin config'] = function (test) {
    plugins_manager.start(DEFAULT_OPTIONS, function (err, manager) {
        if (err) {
            return test.done(err);
        }
        var hoodie = manager.createAPI({name: 'myplugin'});

        test.equal(hoodie.config.get('foo'), 'bar');

        var url = hoodie._resolve('plugins/plugin%2Fmyplugin');
        var doc = {config: {foo: 'wibble'}};
        setTimeout(function () {
            couchr.put(url, doc, function (err) {
                if (err) {
                    return test.done(err);
                }
                // test that couchdb change event causes config to update
                setTimeout(function () {
                    test.equal(hoodie.config.get('foo'), 'wibble');
                    manager.stop(test.done);
                }, 200);
            });
        }, 200);
    });
};

exports['automatically update app config'] = function (test) {
    plugins_manager.start(DEFAULT_OPTIONS, function (err, manager) {
        if (err) {
            return test.done(err);
        }
        var hoodie = manager.createAPI({name: 'myplugin'});

        test.equal(hoodie.config.get('foo'), 'bar');

        var url = hoodie._resolve('app/config');
        setTimeout(function () {
            couchr.get(url, function (err, doc) {
                if (err) {
                    return test.done(err);
                }
                doc.config.foo = 'wibble';
                couchr.put(url, doc, function (err) {
                    if (err) {
                        return test.done(err);
                    }
                    // test that couchdb change event causes config to update
                    setTimeout(function () {
                        test.equal(hoodie.config.get('foo'), 'wibble');
                        manager.stop(test.done);
                    }, 200);
                });
            });
        }, 200);
    });
};
