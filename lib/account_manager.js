var events = require('events'),
    couchr = require('couchr');


exports.start = function (manager, callback) {
    var am = {};

    var ev = new events.EventEmitter();
    am.emit = function () {
        ev.emit.apply(ev, arguments);
    };
    am.on = function () {
        ev.on.apply(ev, arguments);
    };

    var user_db = manager._resolve('_users');
    var feed = couchr.changes(user_db, {include_docs: true});

    feed.on('change', function (change) {
        am.emit('change', change);
    });

    am.stop = function (callback) {
        feed.once('error', function (err) {
            // ignore connection errors during stopping of feed
            if (err.code !== 'ECONNREFUSED' &&
                err.code !== 'ECONNRESET') {
                throw err;
            }
        });
        feed.once('stop', callback);
        feed.stop();
    };

    process.nextTick(function () {
        callback(null, am);
    });
};
