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

    tm.addSource = function (name, /*optional*/callback) {
        //console.log(['addSource', name]);
        callback = callback || function (err) {
            if (err) {
                console.error('Error adding source: ' + name);
                console.error(err);
            }
        };
        function docChangeEvent(doc) {
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
        pool.remove(name);

        // TODO: remove this from API docs and eliminate callback argument
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
