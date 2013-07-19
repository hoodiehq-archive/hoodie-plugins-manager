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

exports['trigger account events in plugins'] = function (test) {
    plugins_manager.start(DEFAULT_OPTIONS, function (err, manager) {
        if (err) {
            return test.done(err);
        }
        var hoodie = manager.createAPI({name: 'myplugin'});

        var evs = [];
        function pushEv(name) {
            return function (change) {
                if (change.deleted) {
                    evs.push(name + ' deleted');
                }
                else {
                    evs.push(name + ' ' + change.doc.name);
                }
            };
        }
        function recEvent(name) {
            hoodie.account.on(name, pushEv(name));
        }
        recEvent('change');
        recEvent('change:user');
        recEvent('change:other');

        var doc = {name: 'foo', password: 'secret'};
        async.series([
            async.apply(hoodie.account.add, 'user', doc),
            async.apply(hoodie.account.update, 'user', 'foo', {asdf: 123}),
            async.apply(hoodie.account.remove, 'user', 'foo')
        ],
        function (err) {
            if (err) {
                return test.done(err);
            }
            setTimeout(function () {
                test.same(evs, [
                    //'add foo',
                    'change foo',
                    //'add:user foo',
                    'change:user foo',
                    //'update foo',
                    'change foo',
                    //'update:user foo',
                    'change:user foo',
                    //'remove foo',
                    //'remove:user foo',
                    'change deleted'
                ]);
                test.done();
            }, 200);
        });
    });
};

exports['trigger task events in plugins'] = function (test) {
    plugins_manager.start(DEFAULT_OPTIONS, function (err, manager) {
        if (err) {
            return test.done(err);
        }
        var hoodie = manager.createAPI({name: 'myplugin'});

        var tasklist = [];
        function recEvent(name) {
            hoodie.task.on(name, function (db, change) {
                if (change.deleted) {
                    tasklist.push(name + ' deleted');
                }
                else {
                    tasklist.push(name + ' ' + change.doc.name);
                }
            });
        }
        recEvent('change');
        recEvent('change:$mytask');
        recEvent('change:$other');

        hoodie.database.add('foo', function (err) {
            if (err) {
                return test.done(err);
            }
            hoodie.task.addSource('foo');
            var doc = {id: 'asdf', name: 'test'};
            var db = hoodie.database('foo');
            async.series([
                async.apply(db.add, '$mytask', doc),
                async.apply(db.add, 'notatask', doc),
                async.apply(db.update, '$mytask', 'asdf', {foo: 'bar'}),
                async.apply(db.remove, '$mytask', 'asdf')
            ],
            function (err) {
                if (err) {
                    return test.done(err);
                }
                // give it time to return in _changes feed
                setTimeout(function () {
                    test.same(tasklist, [
                        'change test',
                        'change:$mytask test',
                        'change test',
                        'change:$mytask test',
                        'change deleted',
                        'change:$mytask deleted'
                    ]);
                    // task events should no longer fire from this db
                    hoodie.task.removeSource('foo');
                    tasklist = [];
                    db.add('$othertask', doc, function () {
                        // give it time to return in _changes feed
                        setTimeout(function () {
                            test.same(tasklist, []);
                            test.done();
                        }, 200);
                    });
                }, 200);
            });
        });
    });
};
