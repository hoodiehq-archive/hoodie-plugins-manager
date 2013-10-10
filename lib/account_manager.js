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


    // CouchDB 1.4.0 has a introduced the requirement that user fields be explicitly declared public for them to be 
    // returned. In the case of admins, this filtering should not be applied, but there's a bug.
    // BUG: https://issues.apache.org/jira/browse/COUCHDB-1888
    var couchRoot = manager._resolve('');    
    
    couchr.get(couchRoot, function(err, result) {
        if (err) {
            return callback(err, null);
        }

        if (result.version === '1.4.0') {
            var config_db = manager._resolve('_config');

            var publicFields = [
                '_id', '_rev,name', 'password_sha', 'password_scheme', 'iterations', 
                'name', 'roles', 'derived_key', 'salt', 'database', 'ownerHash', 
                'updatedAt', 'signedUpAt', 'type'
            ];

            couchr.put(config_db + '/couch_httpd_auth/public_fields', JSON.stringify(publicFields.join(',')), function() {
                callback(null, am);
            });
        } else {
            callback(null, am);
        }
    });

};
