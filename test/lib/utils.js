var child_process = require('child_process')
var urlParse = require('url').parse

var async = require('async')
var MultiCouch = require('multicouch')
var mkdirp = require('mkdirp')
var request = require('request')
var rimraf = require('rimraf')

exports.killCouch = function (opts, callback) {
  var cmd = 'pkill -f ' + opts.data_dir

  child_process.exec(cmd, function (er, stdout, stderr) {
    // ignore errors from pkill
    callback()
  })
}

exports.stopCouch = function (opts, couch, callback) {
  // kill after timeout
  var t = setTimeout(function () {
    exports.killCouch(opts, function () {
      var _cb = callback
      callback = function () {}
      _cb()
    })
  }, 2000)

  // try to stop normally first
  couch.once('stop', function () {
    clearTimeout(t)
    callback()
  })

  couch.stop()
}

exports.setupCouch = function (opts, callback) {
  async.series([
    async.apply(exports.killCouch, opts),
    async.apply(rimraf, opts.data_dir),
    async.apply(mkdirp, opts.data_dir),
    async.apply(startCouch, opts),
    async.apply(createAdmin, opts)
  ], function (err, results) {
    if (err) {
      return callback(err)
    }

    var couch = results[3]

    process.setMaxListeners(100)
    process.on('exit', function (code) {
      couch.once('stop', function () {
        process.exit(code)
      })
      couch.stop()
    })

    callback(null, couch)
  })
}

function startCouch (opts, callback) {
  // MultiCouch config object
  var couch_cfg = {
    port: urlParse(opts.url).port,
    prefix: opts.data_dir,
    respawn: false // otherwise causes problems shutting down
  }
  // starts a local couchdb server using the Hoodie app's data dir
  var couchdb = new MultiCouch(couch_cfg)
  // local couchdb has started
  couchdb.on('start', function () {
    // give it time to be ready for requests
    pollCouch(opts, couchdb, function (err) {
      if (err) {
        return callback(err)
      }
      return callback(null, couchdb)
    })
  })
  couchdb.on('error', callback)
  couchdb.start()
}

function createAdmin (opts, callback) {
  request({
    url: opts.url + '/_config/admins/' + opts.user,
    method: 'PUT',
    body: JSON.stringify(opts.pass)
  }, callback)
}

function pollCouch (opts, couchdb, callback) {
  function _poll () {
    var options = {
      url: opts.url + '/_all_dbs'
    }

    request(options, function (er, res, body) {
      if (res && res.statusCode === 200) {
        return callback(null, couchdb)
      } else {
        // wait and try again
        return setTimeout(_poll, 100)
      }
    })
  }

  // start polling
  _poll()
}
