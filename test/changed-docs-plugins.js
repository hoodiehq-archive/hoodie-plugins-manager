var async = require('async')
var test = require('tap').test

var OPTS = require('./lib/default-options')
var pluginsManager = require('../lib/index')

test('changed docs passed to plugins can be modified', function (t) {
  pluginsManager.start(OPTS, function (error, manager) {
    if (error) throw error

    var hoodie1 = manager.createAPI({name: 'myplugin1'})
    var hoodie2 = manager.createAPI({name: 'myplugin2'})

    hoodie1.account.on('change', function (doc) {
      t.ok(!doc.processed_by)
      doc.processed_by = 1
    })
    hoodie2.account.on('change', function (doc) {
      t.ok(!doc.processed_by)
      doc.processed_by = 2
    })
    hoodie1.task.on('change', function (db, doc) {
      t.ok(!doc.processed_by)
      doc.processed_by = 1
    })
    hoodie2.task.on('change', function (db, doc) {
      t.ok(!doc.processed_by)
      doc.processed_by = 2
    })

    hoodie1.database.add('foo', function (error) {
      if (error) throw error
      hoodie1.task.addSource('foo')
      var task_doc = {id: 'asdf', name: 'test'}
      var user_doc = {id: 'foo', password: 'secret'}
      var db = hoodie1.database('foo')
      async.series([
        async.apply(hoodie1.account.add, 'user', user_doc),
        async.apply(db.add, '$mytask', task_doc)
      ],
      function (error, results) {
        if (error) throw error
        setTimeout(function () {
          manager.stop(function (error) {
            if (error) throw error
            t.end()
            process.exit()
          })
        }, 200)
      })
    })
  })
})
