var PluginAPI = require('hoodie-plugins-api').PluginAPI,
    accounts_api = require('hoodie-plugins-api/lib/accounts'),
    config_manager = require('./config_manager'),
    account_manager = require('./account_manager'),
    email_manager = require('./email_manager'),
    task_manager = require('./task_manager'),
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
        account_manager: async.apply(account_manager.start, manager),
        task_manager: async.apply(task_manager.start, manager),
    },
    function (err, results) {
        if (err) {
            return callback(err);
        }

        var cm = results.config_manager;
        var am = results.account_manager;
        var tm = results.task_manager;

        var em = email_manager.start(cm);

        // update email settings on app config update
        cm.on('appcfg', em.updateConfig);

        manager.createAPI = function (opt) {
            opt.couchdb = options.couchdb;
            opt.config = {
                app: cm.getAppConfig(),
                plugin: cm.getPluginConfig(opt.name)
            };
            opt.addSource = tm.addSource;
            opt.removeSource = tm.removeSource;
            opt.sendEmail = em.sendEmail;

            var api = new PluginAPI(opt);
            cm.on('appcfg', api.config._updateAppConfig);
            cm.on('plugincfg', function (name, cfg) {
                if (name === opt.name) {
                    api.config._updatePluginConfig(cfg);
                }
            });
            tm.on('change', function (db, change) {
                api.task.emit('change', db, change.doc);
                if (!change.doc.hasOwnProperty('$processedAt')) {
                    api.task.emit('add', db, change.doc);
                }
                if (change.doc.type) {
                    var type = change.doc.type.substr(1);
                    api.task.emit('change:' + type, db, change.doc);
                    if (!change.doc.hasOwnProperty('$processedAt')) {
                        api.task.emit('add:' + type, db, change.doc);
                    }
                }
            });
            am.on('change', function (change) {
                if (change.doc) {
                    change.doc = accounts_api.parseDoc(change.doc);
                }
                api.account.emit('change', change.doc);
                if (change.doc && change.doc.type) {
                    api.account.emit('change:' + change.doc.type, change.doc);
                }
            });
            return api;
        };

        manager.stop = function (callback) {
            async.parallel([
                cm.stop,
                am.stop,
                tm.stop,
                em.stop
            ],
            callback);
        };

        callback(null, manager);
    });
};
