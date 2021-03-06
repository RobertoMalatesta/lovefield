/**
 * @license
 * Copyright 2014 The Lovefield Project Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
goog.setTestOnly();
goog.require('goog.Promise');
goog.require('goog.testing.AsyncTestCase');
goog.require('goog.testing.jsunit');
goog.require('hr.bdb');
goog.require('lf.testing.Capability');
goog.require('lf.testing.SmokeTester');


/** @type {!goog.testing.AsyncTestCase} */
var asyncTestCase =
    goog.testing.AsyncTestCase.createAndInstall('CRUDTestBundled');


/** @type {!lf.testing.SmokeTester} */
var tester;


/** @type {!lf.testing.Capability} */
var capability;


function setUpPage() {
  capability = lf.testing.Capability.get();
}


function setUp() {
  if (!capability.indexedDb) {
    return;
  }

  asyncTestCase.waitForAsync('setUp');
  hr.bdb.connect().then(function(database) {
    tester = new lf.testing.SmokeTester(hr.bdb.getGlobal(), database);
    return tester.clearDb();
  }).then(function() {
    asyncTestCase.continueTesting();
  }, fail);
}


function testCRUD() {
  if (!capability.indexedDb) {
    return;
  }

  asyncTestCase.waitForAsync('testCRUD');
  tester.testCRUD().then(function() {
    asyncTestCase.continueTesting();
  }, fail);
}


function testOverlappingScope_MultipleInserts() {
  if (!capability.indexedDb) {
    return;
  }

  asyncTestCase.waitForAsync('testOverlappingScope_MultipleInserts');
  tester.testOverlappingScope_MultipleInserts().then(function() {
    asyncTestCase.continueTesting();
  }, fail);
}


function testTransaction() {
  if (!capability.indexedDb) {
    return;
  }

  asyncTestCase.waitForAsync('testTransaction');
  tester.testTransaction().then(function() {
    asyncTestCase.continueTesting();
  }, fail);
}
