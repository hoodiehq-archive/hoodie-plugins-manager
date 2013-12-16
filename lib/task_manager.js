var databases_api = require('hoodie-plugins-api/lib/databases'),
    changes_pool = require('./changes_pool'),
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

    var pool = changes_pool.create(manager.couch_url);

    function docChangeEvent(doc, name) {
        doc = databases_api.parseDoc(doc);
        if (doc.type && doc.type[0] === '$') {
            tm.emit('change', name, {doc: doc});
        }
    }

    var queue = async.queue(function(name, callback) {
        console.log("calling all_docs");
        var db_url = manager._resolve(encodeURIComponent(name));
        var q = {
            start_key: '"$"',
            end_key: '"${}"',
            include_docs: true
        };
        couchr.get(db_url + '/_all_docs', q, function (err, body, res) {
            if (err) {
                return callback(err);
            }
            body.rows.forEach(function (row) {
                if (row.doc) {
                    docChangeEvent(row.doc, name);
                }
            });
            callback();
        });
    }, 1);

    tm.addSource = function (name, /*optional*/callback) {
        console.log(['addSource', name]);
        callback = callback || function (err) {
            if (err) {
                console.error('Error adding source: ' + name);
                console.error(err);
            }
        };
        function docChangeEvent(doc) {
            console.log(['docChangeEvent', doc]);
            doc = databases_api.parseDoc(doc);
            if (doc.type && doc.type[0] === '$') {
                tm.emit('change', name, {doc: doc});
            }
        }
        pool(name, {since: 0, include_docs: true}, function (err, change) {
            if (err) {
                console.error('Error getting update from changes pool');
                console.error(err);
                return;
            }
            if (change.doc) {
                docChangeEvent(change.doc);
            }
        });
    };

    tm.removeSource = function (name, /*optional*/callback) {
        changes_pool.removeDB(pool, name);
        if (callback) {
            return callback();
        }
    };

    tm.stop = function (callback) {
        var names = Object.keys(feeds);
        async.map(names, tm.removeSource, callback);
    };

    callback(null, tm);
};
