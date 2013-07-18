var PluginAPI = require('hoodie-plugins-api').PluginAPI,
    accounts_api = require('hoodie-plugins-api/lib/accounts'),
    config_manager = require('./config_manager'),
    account_manager = require('./account_manager'),
    async = require('async'),
    url = require('url');


exports.start = function (options, callback) {
    var manager = {};

    /**
     * Create authenticated URL to make requests with
     */

    var couch_url = url.parse(options.couchdb.url);
    couch_url.auth = options.couchdb.user + ':' + options.couchdb.pass;

    /**
     * Resolves a path relative to the authenticated CouchDB URL
     */

    manager._resolve = function (path) {
        return url.resolve(couch_url, path);
    };

    async.parallel({
        config_manager: async.apply(config_manager.start, manager),
        account_manager: async.apply(account_manager.start, manager)
    },
    function (err, results) {
        if (err) {
            return callback(err);
        }

        var cm = results.config_manager;
        var am = results.account_manager;

        manager.createAPI = function (opt) {
            opt.couchdb = options.couchdb;
            opt.config = {
                app: cm.getAppConfig(),
                plugin: cm.getPluginConfig(opt.name)
            };
            var api = new PluginAPI(opt);
            cm.on('appcfg', api.config._updateAppConfig);
            cm.on('plugincfg', function (name, cfg) {
                if (name === opt.name) {
                    api.config._updatePluginConfig(cfg);
                }
            });
            am.on('change', function (change) {
                if (change.doc) {
                    change.doc = accounts_api.parseDoc(change.doc);
                }
                api.account.emit('change', change);
                if (change.doc && change.doc.type) {
                    api.account.emit('change:' + change.doc.type, change);
                }
            });
            return api;
        };

        manager.stop = function (callback) {
            async.parallel([
                cm.stop,
                am.stop
            ],
            callback);
        };

        callback(null, manager);
    });
};
