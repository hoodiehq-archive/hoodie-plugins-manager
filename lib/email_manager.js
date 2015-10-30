var dataurl = require('dataurl')
var nodemailer = require('nodemailer')
var smtpTransport = require('nodemailer-smtp-transport')
var mandrillTransport = require('nodemailer-mandrill-transport')
var sgTransport = require('nodemailer-sendgrid-transport')

exports.start = function (config_manager) {
  var transport, transportPlugin, cfg

  function updateConfig (appcfg) {
    if (appcfg.email_service === 'Mandrill') {
      transportPlugin = mandrillTransport
      cfg = {
        auth: {
          apiKey: appcfg.email_pass
        }
      }
    } else if (appcfg.email_service === 'Sendgrid') {
      transportPlugin = sgTransport
      cfg = {
        auth: {
          api_key: appcfg.email_pass
        }
      }
    } else if (appcfg.email_service === 'Gmail') {
      transportPlugin = function (config) {
        return config
      }
      cfg = {
        service: 'gmail',
        auth: {
          user: appcfg.email_user,
          pass: appcfg.email_pass
        }
      }
    } else { // default to smpt
      transportPlugin = smtpTransport
      cfg = {
        host: appcfg.email_host,
        port: appcfg.email_port,
        secure: appcfg.email_secure
      }
      if (appcfg.email_user) {
        cfg.auth = {
          user: appcfg.email_user,
          pass: appcfg.email_pass
        }
      }
    }

    if (transport) {
      // retire old connection pool
      var _transport = transport
      _transport.close()
    }

    // create new connection pool with updated config
    transport = nodemailer.createTransport(transportPlugin(cfg))
  }

  // set up initial config
  updateConfig(config_manager.getAppConfig())

  return {
    updateConfig: updateConfig,
    sendEmail: function (opt, callback) {
      try {
        // clone opt object as sendMail will extend it with
        // non JSON-serializable 'transport' property
        var email = JSON.parse(JSON.stringify(opt))
      } catch (e) {
        return callback(e)
      }

      if (email.attachments) {
        email.attachments = email.attachments.map(function (att) {
          // strip filePath properties from attachments
          delete att.filePath
          // parse dataURI properties
          if (att.dataURI) {
            var parsed = dataurl.parse(att.dataURI)
            att.contents = parsed.data
            att.contentType = parsed.mimetype
            delete att.dataURI
          }
          return att
        })
      }

      return transport.sendMail(email, function (err) {
        if (err) {
          // nodemailer errors are missing .message property
          err.message = 'Could not deliver email: ' + err.data
        }

        callback(err)
      })
    },
    stop: function (callback) {
      transport.close()
      return callback()
    }
  }
}
