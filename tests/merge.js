var assert = require('chai').assert
var fs = require('fs')
var path = require('path')
var rimraf = require('rimraf').sync

var testDirectory = path.join(__dirname, '..', '..', 'test-temp')

var vetus = require('./../app')({ path: testDirectory })

describe('(Basic) Merging test', function() {

  var branchData
  var masterData

  before(function(done) {
    if (fs.existsSync(testDirectory)) {
      rimraf(testDirectory)
    }

    fs.mkdirSync(testDirectory)

    vetus.collection({name: 'test'}, function(saveCollection) {
      saveCollection.data.first = { name: 'first' }
      console.log("Saving master")
      saveCollection.save('commit', function(err) {
        vetus.collection({name: 'test', branch: 'dev'}, function(collection) {
          console.log("Loading dev")
          collection.load(function() {
            collection.data.first = { name: 'updated' }
            console.log("Saving dev")
            collection.save('commit', function(err) {
              console.log("Loading master")
              saveCollection.load(function() {
                saveCollection.data.second = { name: 'second' }
                console.log("Saving master")
                saveCollection.save('commit2', function(err) {
                  console.log("Merging dev to master")
                  collection.merge('master', function(err) {
                    console.log("TESTING ------")
                    vetus.collection({name: 'test', branch:'dev'}, function(branchCollection) {
                      branchCollection.load(function() {
                        branchData = branchCollection.data
                        vetus.collection({name: 'test'}, function(masterCollection) {
                          masterCollection.load(function() {
                            masterData = masterCollection.data
                            done()
                          })
                        })
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })

  after(function() {
    rimraf(testDirectory)
  })

  it('Dev and Master merged successfully', function(done) {
    assert(masterData.first.name === branchData.first.name)
    done()
  })
  it('Master keeps changes', function(done) {
    assert(masterData.second.name)
    done()
  })
  it('Dev has not changed', function(done) {
    assert(!branchData.second)
    done()
  })
})
