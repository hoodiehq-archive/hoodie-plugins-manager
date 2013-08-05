var plugins_manager = require('../lib/index'),
    nodemailer = require('nodemailer'),
    couchr = require('couchr'),
    utils = require('./lib/utils'),
    async = require('async'),
    url = require('url'),
    _ = require('underscore');

require('long-stack-traces');


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
            config: {
                foo: 'bar',
                email_host: 'emailhost',
                email_port: 465,
                email_user: 'gmail.user@gmail.com',
                email_pass: 'userpass',
                email_secure: true,
                email_service: 'Gmail'
            }
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

exports['sendEmail'] = function (test) {
    test.expect(5);
    var email = {
        to: 'to@hood.ie',
        from: 'from@hood.ie',
        subject: 'subject',
        text: 'blah blah',
    };
    var createTransport_calls = [];
    var sendMail_calls = [];
    var close_calls = [];

    var _createTransport = nodemailer.createTransport;
    nodemailer.createTransport = function (type, config) {
        test.equal(type, 'SMTP');
        createTransport_calls.push(config);
        return {
            close: function (callback) {
                close_calls.push(config);
                if (callback) {
                    callback();
                }
            },
            sendMail: function (opt, callback) {
                sendMail_calls.push(opt);
                callback();
            }
        };
    };
    plugins_manager.start(DEFAULT_OPTIONS, function (err, manager) {
        if (err) {
            return test.done(err);
        }
        var hoodie = manager.createAPI({name: 'myplugin'});
        hoodie.sendEmail(email, function (err) {
            var appcfg = {
                foo: 'bar',
                email_host: 'emailhost2',
                email_port: 123,
                email_user: 'gmail.user2@gmail.com',
                email_pass: 'userpass2',
                email_secure: false,
                email_service: 'Gmail2'
            };
            var url = hoodie._resolve('app/config');
            couchr.get(url, function (err, doc) {
                if (err) {
                    return test.done(err);
                }
                doc.config = appcfg;
                couchr.put(url, doc, function (err) {
                    if (err) {
                        return test.done(err);
                    }
                    setTimeout(function () {
                        hoodie.sendEmail(email, function (err) {
                            test.same(createTransport_calls, [
                                {
                                    host: 'emailhost',
                                    port: 465,
                                    auth: {
                                        user: 'gmail.user@gmail.com',
                                        pass: 'userpass'
                                    },
                                    secureConnection: true,
                                    service: 'Gmail'
                                },
                                {
                                    host: 'emailhost2',
                                    port: 123,
                                    auth: {
                                        user: 'gmail.user2@gmail.com',
                                        pass: 'userpass2'
                                    },
                                    secureConnection: false,
                                    service: 'Gmail2'
                                }
                            ]);
                            test.same(close_calls, [
                                {
                                    host: 'emailhost',
                                    port: 465,
                                    auth: {
                                        user: 'gmail.user@gmail.com',
                                        pass: 'userpass'
                                    },
                                    secureConnection: true,
                                    service: 'Gmail'
                                }
                            ]);
                            test.same(sendMail_calls, [email, email]);
                            nodemailer.createTransport = _createTransport;
                            manager.stop(test.done);
                        });
                    }, 100);
                });
            });
        });
    });
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

        var doc = {id: 'foo', password: 'secret'};
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
                    'change user/foo',
                    'change:user user/foo',
                    'change user/foo',
                    'change:user user/foo',
                    'change deleted',
                    'change:user deleted'
                ]);
                manager.stop(test.done);
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
            function (err, results) {
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
                            manager.stop(test.done);
                        }, 200);
                    });
                }, 200);
            });
        });
    });
};
