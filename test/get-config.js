var request = require('request')
var test = require('tap').test

var OPTS = require('./lib/default-options')
var pluginsManager = require('../lib/index')

test('get config values from plugin manager', function (t) {
  var doc = JSON.stringify({
    config: {
      asdf: 123
    }
  })
  request.put(OPTS.base_url + '/plugins/plugin%2Fmyplugin9', {body: doc}, function (error, res) {
    if (error) throw error
    t.is(res.statusCode, 201, 'HTTP status code')
    pluginsManager.start(OPTS, function (error, manager) {
      if (error) throw error
      var hoodie = manager.createAPI({name: 'myplugin9'})
      t.is(hoodie.config.get('foo'), 'bar')
      t.is(hoodie.config.get('asdf'), 123)
      manager.stop(function (error) {
        t.error(error)
        t.end()
        process.exit()
      })
    })
  })
})
