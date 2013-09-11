var databases_api = require('hoodie-plugins-api/lib/databases'),
    events = require('events'),
    couchr = require('couchr'),
    async = require('async');


exports.start = function (manager, callback) {
    var tm = {};

    var ev = new events.EventEmitter();
    tm.on = function () {
        return ev.on.apply(ev, arguments);
    };
    tm.emit = function () {
        return ev.emit.apply(ev, arguments);
    };

    var feeds = {};

    tm.addSource = function (name) {
        if (!feeds[name]) {
            var db_url = manager._resolve(name);
            var feed = couchr.changes(db_url, {include_docs: true});
            feed.on('change', function (change) {
                if (change.doc) {
                    change.doc = databases_api.parseDoc(change.doc);
                    if (change.doc.type && change.doc.type[0] === '$') {
                        tm.emit('change', name, change);
                    }
                }
            });
            feed.on('error', function (err) {
                console.error(err);
            });
            feeds[name] = feed;
        }
    };

    tm.removeSource = function (name, /*optional*/callback) {
        var feed = feeds[name];
        if (feed) {
            feed.once('error', function (err) {
                // ignore connection errors during stopping of feed
                if (err.code !== 'ECONNREFUSED' &&
                    err.code !== 'ECONNRESET') {
                    throw err;
                }
            });
            feed.on('stop', function () {
                delete feeds[name];
                if (callback) {
                    return callback();
                }
            });
            feed.stop();
        }
    };

    tm.stop = function (callback) {
        var names = Object.keys(feeds);
        async.map(names, tm.removeSource, callback);
    };

    callback(null, tm);
};
