var PluginAPI = require('hoodie-plugins-api').PluginAPI,
    config_manager = require('./config_manager'),
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

    config_manager.start(manager, function (err, cm) {
        if (err) {
            return callback(err);
        }

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
            return api;
        };

        manager.stop = function (callback) {
            cm.stop(callback);
        };

        callback(null, manager);
    });
};
