var nodemailer = require('nodemailer')
var request = require('request')
var test = require('tap').test

var OPTS = require('./lib/default-options')
var pluginsManager = require('../lib/index')

test('sendEmail function', function (t) {
  t.plan(6)
  var email = {
    to: 'to@hood.ie',
    from: 'from@hood.ie',
    subject: 'subject',
    text: 'blah blah'
  }
  var createTransport_calls = []
  var sendMail_calls = []
  var close_calls = []

  var _createTransport = nodemailer.createTransport
  nodemailer.createTransport = function (config) {
    t.equal(config.name, 'SMTP')
    createTransport_calls.push(config.options)
    return {
      close: function (callback) {
        close_calls.push(config.options)
        if (callback) {
          callback()
        }
      },
      sendMail: function (opt, callback) {
        sendMail_calls.push(opt)
        callback()
      }
    }
  }
  pluginsManager.start(OPTS, function (error, manager) {
    if (error) throw error
    var hoodie = manager.createAPI({name: 'myplugin'})
    hoodie.sendEmail(email, function () {
      var appcfg = {
        foo: 'bar',
        email_host: 'emailhost2',
        email_port: 123,
        email_secure: false,
        email_service: 'smtp'
      }
      var url = hoodie._resolve('app/config')

      request.get(url, function (error, res, data) {
        if (error) throw error
        var doc = JSON.parse(data)
        doc.config = appcfg
        request.put(url, {body: JSON.stringify(doc)}, function (error) {
          if (error) throw error
          setTimeout(function () {
            hoodie.sendEmail(email, function () {
              t.same(createTransport_calls, [
                {
                  host: 'emailhost',
                  auth: {
                    user: 'gmail.user@gmail.com',
                    pass: 'userpass'
                  },
                  port: 465,
                  secure: true,
                  name: '[127.0.0.1]'
                },
                {
                  host: 'emailhost2',
                  port: 123,
                  secure: false,
                  name: '[127.0.0.1]'
                }
              ])
              t.same(close_calls, [
                {
                  host: 'emailhost',
                  auth: {
                    user: 'gmail.user@gmail.com',
                    pass: 'userpass'
                  },
                  port: 465,
                  secure: true,
                  name: '[127.0.0.1]'
                }
              ])
              t.same(sendMail_calls, [email, email])
              nodemailer.createTransport = _createTransport
              manager.stop(function (error) {
                t.error(error)
                t.end()
                process.exit()
              })
            })
          }, 100)
        })
      })
    })
  })
})
