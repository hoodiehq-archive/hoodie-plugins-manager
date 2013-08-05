var nodemailer = require('nodemailer');


exports.start = function (config_manager) {
    var transport;

    function updateConfig(appcfg) {
        var cfg = {
            host: appcfg.email_host,
            port: appcfg.email_port,
            auth: {
                user: appcfg.email_user,
                pass: appcfg.email_pass
            },
            secureConnection: appcfg.email_secure,
            service: appcfg.email_service
        };
        if (transport) {
            // retire old connection pool
            var _transport = transport;
            _transport.close();
        }
        // create new connection pool with updated config
        transport = nodemailer.createTransport("SMTP", cfg);
    }

    // set up initial config
    updateConfig(config_manager.getAppConfig());

    return {
        updateConfig: updateConfig,
        sendEmail: function (opt, callback) {
            return transport.sendMail(opt, callback);
        },
        stop: function (callback) {
            return transport.close(callback);
        }
    };
};
