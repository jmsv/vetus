var path = require('path')
var Repository = require('./repository')
var fs = require('fs')
var Promise = require('promise')
var mkdirp = require('mkdirp')
let rimraf = require('rimraf')
let gloop = require('./gloop')
let splat = require('./splat')

var write = Promise.denodeify(fs.writeFile)
var read = Promise.denodeify(fs.readFile)

module.exports = function(options) {
  var root = options.path
  var user = options.user || '_default'
  var email = options.email || user + '@vetus'
  var branch = options.branch || 'master'

  var bareroot = path.join(root, '_bare')
  var userroot = path.join(root, user)

  var barerepo = new Repository(bareroot)
  var repo = new Repository(userroot)

  var data = {}

  var load = function(callback) {
    preCommand(function(branchExists) {
      let dataPath = path.join(userroot, 'data')
      fs.readFile(path.join(userroot, 'data.json'), 'utf-8', function(err, file) {
        if (err) console.log(err)
        collection.data = JSON.parse(file)
        callback()
      })
    })
  }

  var save = function(message, callback) {
    preCommand(function() {
      fs.writeFile(path.join(userroot, 'data.json'), JSON.stringify(collection.data), function() {
        addAndCommit(message, function(commited) {
          if (commited) {
            repo.push(" origin " + branch, callback)
          } else {
            callback()
          }
        })
      })
    })
  }

  var merge = function(fromBranch, callback) {
    preCommand(function(exists) {
      repo.merge(fromBranch, function(output, err) {
        if (err) {
          repo.merge(" --abort", function() {
            return console.log("Merge conflict : ", output)
          })
        } else {
          callback()
        }
      })
    })
  }

  var deleteBranch = function(branchToDelete, callback) {
    repo.fetch(function() {
      repo.branchExists(branchToDelete, function(branchExists) {
        if (!branchExists) {
          return callback()
        }

        repo.deleteBranch(branchToDelete, function(err) {
          callback(err)
        })
      })
    })
  }

  var createBranch = function(newbranch, callback) {
    preCommand(function(oldBranchExists) {
      repo.branchExists(newbranch, function(branchExists){
        if (!branchExists) {
          repo.execute("checkout " + branch)
            .then(() => repo.execute("checkout -b " + newbranch))
            .then(() => branch = newbranch)
            .then(() => repo.execute("push -u origin " + newbranch))
            .nodeify(callback)

        } else {
          callback()
        }
      })
    })
  }

  var changeBranch = function(newbranch, callback) {
    repo.branchExists(newbranch, function(branchExists){
      if (branchExists) {
        repo.checkout(newbranch, function() {
          branch = newbranch

          callback(branchExists)
        })
      } else {
        callback(branchExists)
      }
    })
  }

  var checkBareGit = function(callback) {
    baregitExists(bareroot, function(bareExists) {
      if (!bareExists) {
        barerepo.initBare(callback)
      } else {
        callback()
      }
    })
  }

  var addAndCommit = function(message, callback) {
    repo.addAll(function() {
      repo.status(function(status) {
        if (status.indexOf('nothing to commit') < 0) {
          repo.commit(message, function() {
            callback(true)
          })
        } else {
          callback(false)
        }
      })
    })
  }

  var checkUserGit = function(callback) {
    gitExists(userroot, function(userExists) {
      if (!userExists) {
        repo.clone(bareroot, function() {
          repo.config('user.name "' + user + '"', function() {
            repo.config('user.email ' + email, function() {
              callback(userExists)
            })
          })
        })
      } else {
        callback(userExists)
      }
    })
  }

  var gitExists = function(gitroot, callback) {
    fs.lstat(path.join(gitroot, '.git'), function(lstatErr, stats) {
      if (lstatErr) {
        return callback(false)
      }

      callback(stats.isDirectory())
    })
  }

  var baregitExists = function(gitroot, callback) {
    fs.lstat(path.join(gitroot, 'info'), function(lstatErr, stats) {
      if (lstatErr) {
        return callback(false)
      }

      callback(stats.isDirectory())
    })
  }

  baregitExists(bareroot, function(result){
    barerepoInit = result
  })

  var checkPaths = function(paths) {
    var proms = paths.map(p => new Promise(function(fulfill, reject) {
      fs.lstat(p, function(err, stats) {

        if (!stats || !stats.isDirectory()) {
          mkdirp(p, fulfill)
        } else {
          fulfill()
        }
      })
    }))

    return Promise.all(proms)
  }

  var branchList = function(callback) {
    preCommand(function() {
      repo.fetch(function() {
        repo.branchList(function(list) {
          var items = list.split('\n')

          var items = items
            .filter(b => b !== '')
            .map(b => b.replace('* ', '').replace('  ', '').replace('remotes/origin/', ''))
            .filter(b => !b.startsWith('HEAD'))

          callback(arrayUnique(items))
        })
      })
    })
  }

  var pull = function(callback) {
    repo.pull('origin ' + branch, callback)
  }

  var preCommand = function(callback) {
    checkPaths([bareroot, userroot])
      .then(() => {
        checkBareGit(function() {
          checkUserGit(function() {
            repo.isNew(function(isNew) {
              if (isNew) {
                callback(true)
              } else {
                changeBranch(branch ,function(exists) {
                  if (exists) {
                    repo.execute('fetch --prune')
                      .then(() => {
                          pull(callback)
                      })
                  } else {
                      return callback(exists)
                  }
                })
              }
            })

          })
        })
      })
  }

  var arrayUnique = function(a) {
      return a.reduce(function(p, c) {
          if (p.indexOf(c) < 0) p.push(c)
          return p
      }, [])
  }

  var collection = {
    data: data,
    load: load,
    save: save,
    createBranch: createBranch,
    merge: merge,
    branchList: branchList,
    deleteBranch: deleteBranch
  }

  return collection
}
