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
var fsMod = require('fs');
var glob = /** @type {{sync: !Function}} */ (require('glob')).sync;
var mkdir = /** @type {{sync: !Function}} */ (require('mkdirp')).sync;
var pathMod = /** @type {{sep: string}} */ (require('path'));
var rmdir = /** @type {{sync: !Function}} */ (require('rimraf')).sync;
var temp = /** @type {{Dir: !Function}} */ (require('temporary'));


/**
 * @type {{
 *   CLOSURE_LIBRARY_PATH: string,
 *   TEST_SCHEMAS: !Array.<{file: string, namespace: string}>
 *   }
 * }}
 */
var config = /** @type {!Function} */ (require(
    pathMod.resolve(__dirname + '/config.js')))();
var genDeps = /** @type {!Function} */ (require(
    pathMod.join(__dirname, 'scan_deps.js')).genDeps);
var genModuleDeps = /** @type {!Function} */ (require(
    pathMod.join(__dirname, 'scan_deps.js')).genModuleDeps);
var extractRequires = /** @type {!Function} */ (require(
    pathMod.join(__dirname, 'scan_deps.js')).extractRequires);
var generateTestSchemas = /** @type {!Function} */ (require(
    pathMod.join(__dirname, 'builder.js')).generateTestSchemas);



// Make linter happy.
var log = console['log'];


/** @const {!Array<string>} */
var SYMLINKS = ['lib', 'perf', 'testing', 'tests'];


/**
 * Creates a temporary directory that is capable of executing tests.
 * @param {string} testsFolder The folder that contains all the tests.
 * @return {!IThenable<string>} A promise holding the path of the temporary
 *     directory.
 */
function createTestEnv(testsFolder) {
  var tempPath = pathMod.resolve(new temp.Dir().path);
  var origPath = process.cwd();
  process.chdir(tempPath);

  // Generating gen and html folders.
  var genDir = pathMod.join(tempPath, 'gen');
  fsMod.mkdirSync('html');
  var htmlDir = pathMod.join(tempPath, 'html');
  createSymLinks(config.CLOSURE_LIBRARY_PATH, tempPath);

  // Generating HTML files for each test.
  createTestFiles(testsFolder);

  // Creating symlinks for any json files such that the generated html files can
  // refer to them.
  var jsonFiles = glob(testsFolder + '/**/*.json');
  jsonFiles.forEach(function(jsonFile) {
    var link = pathMod.join('html', pathMod.basename(jsonFile));
    fsMod.symlinkSync(
        pathMod.resolve(jsonFile),
        pathMod.join(tempPath, link), 'junction');
  });

  return generateTestSchemas(genDir).then(
      function() {
        var directories = SYMLINKS.map(
            function(dir) {
              return pathMod.join(tempPath, dir);
            }).concat([htmlDir, genDir]);
        var deps = genDeps(tempPath, directories);
        fsMod.writeFileSync('deps.js', deps);
        return tempPath;
      },
      function(e) {
        process.chdir(origPath);
        cleanUp(tempPath);
        throw e;
      });
}


/**
 * Creates symbolic links to Closure and Lovefield.
 * @param {string} libraryPath Closure library path.
 * @param {string} tempPath Test environment path.
 */
function createSymLinks(libraryPath, tempPath) {
  fsMod.symlinkSync(
      pathMod.resolve(pathMod.join(libraryPath, 'closure')),
      pathMod.join(tempPath, 'closure'),
      'junction');
  SYMLINKS.forEach(function(link) {
    fsMod.symlinkSync(
        pathMod.resolve(pathMod.join(__dirname, '../' + link)),
        pathMod.join(tempPath, link),
        'junction');
  });
}


/** Removes previously created symbolic links */
function removeSymLinks() {
  fsMod.unlinkSync('closure');
  SYMLINKS.forEach(function(link) {
    fsMod.unlinkSync(link);
  });
}


/**
 * Creates stub HTML for test files.
 * @param {string} testsFolder
 */
function createTestFiles(testsFolder) {
  var testFiles = glob(testsFolder + '/**/*_test.js');
  log('Generating ' + testFiles.length + ' test files ... ');
  var files = testFiles.map(function(name, index) {
    return createTestHtml(name);
  });

  var links = files.map(function(file) {
    return '    <a href="' + file + '">' + file.slice('html/'.length) +
        '</a><br />';
  });
  var contents =
      '<!DOCTYPE html>\r\n' +
      '<html>\r\n' +
      '  <head>\r\n' +
      '    <meta charset="utf-8" />\r\n' +
      '    <title>Lovefield tests</title>\r\n' +
      '  </head>\r\n' +
      '  <body>\r\n' +
      '    <h1>Lovefield tests</h1>\r\n' +
      links.join('\r\n') +
      '\r\n  </body>\r\n' +
      '</html>\r\n';
  fsMod.writeFileSync('index.html', contents);
  log('\nTest files generated. Starting server @' + process.cwd() + ' ...\n');
}


/**
 * Generates test HTML for a given test script. Depending on how the test is
 * written (i.e. goog.module or not), the HTML generated will be different since
 * different code injection is needed.
 * @param {string} script Path of the script, e.g. tests/foo_test.js.
 * @return {string} Generated file path.
 */
function createTestHtml(script) {
  var scriptPath = pathMod.resolve(pathMod.join(__dirname, '../', script));
  var contents = fsMod.readFileSync(scriptPath, {'encoding': 'utf-8'});
  var LITERAL = 'goog.module';
  var pos = contents.indexOf(LITERAL);
  if (pos != -1) {
    var pos2 = contents.indexOf(';', pos);
    var moduleName = contents.substring(pos + LITERAL.length + 2, pos2 - 2);
    return createTestModule(script, moduleName);
  } else {
    return createTestFile(script);
  }
}


/**
 * @param {string} script Path of the script, e.g. tests/foo_test.js.
 * @param {string} moduleName Test module name.
 * @return {string} Generated file path.
 */
function createTestModule(script, moduleName) {
  var sliceIndex = script.indexOf(pathMod.sep) + 1;
  var target = 'html/' + script.slice(sliceIndex, -2) + 'html';
  var level = target.match(/\//g).length;
  var prefix = new Array(level).join('../') + '../';

  var contents =
      '<!DOCTYPE html>\r\n' +
      '<html>\r\n' +
      '  <head>\r\n' +
      '    <meta charset="utf-8" />\r\n' +
      '    <title>' + pathMod.basename(target).slice(0, -5) + '</title>\r\n' +
      '    <script src="' + prefix + 'closure/goog/base.js"></script>\r\n' +
      '    <script src="' + prefix + 'deps.js"></script>\r\n' +
      '    <script>' + genModuleDeps(script) + '</script>\r\n' +
      '    <script>goog.require(\'' + moduleName + '\');\r\n' +
      '    </script>\r\n' +
      '  </head>\r\n' +
      '</html>\r\n';
  mkdir(pathMod.dirname(target));
  fsMod.writeFileSync(target, contents);

  return target;
}


/**
 * @param {string} script Path of the script, e.g. tests/foo_test.js.
 * @return {string} Generated file path.
 */
function createTestFile(script) {
  var sliceIndex = script.indexOf(pathMod.sep) + 1;
  var target = 'html/' + script.slice(sliceIndex, -2) + 'html';
  var level = target.match(/\//g).length;
  var prefix = new Array(level).join('../') + '../';
  var fakeName = script.replace('/', '$').replace('.', '_');
  var scriptPath = pathMod.resolve(pathMod.join(__dirname, '../' + script));
  var contents =
      '<!DOCTYPE html>\r\n' +
      '<html>\r\n' +
      '  <head>\r\n' +
      '    <meta charset="utf-8" />\r\n' +
      '    <title>' + pathMod.basename(target).slice(0, -5) + '</title>\r\n' +
      '    <script src="' + prefix + 'closure/goog/base.js"></script>\r\n' +
      '    <script src="' + prefix + 'deps.js"></script>\r\n' +
      '  </head>\r\n' +
      '  <body>\r\n' +
      '    <script>\r\n' +
      '      goog.addDependency(\r\n' +
      '          \'../' + prefix + script + '\',\r\n' +
      '          [\'' + fakeName + '\'],\r\n' +
      '          [' + extractRequires(scriptPath) + '], false);\r\n' +
      '      goog.require(\'goog.testing.AsyncTestCase\');\r\n' +
      '      goog.require(\'goog.testing.jsunit\');\r\n' +
      '      goog.require(\'' + fakeName + '\');\r\n' +
      '    </script>\r\n' +
      '  </body>\r\n' +
      '</html>\r\n';
  mkdir(pathMod.dirname(target));
  fsMod.writeFileSync(target, contents);
  return target;
}


/**
 * Removes temp folder.
 * @param {string} tempPath
 */
function cleanUp(tempPath) {
  var origPath = process.cwd();
  removeSymLinks();
  process.chdir(origPath);
  rmdir(tempPath);
}


/** @type {!Function} */
exports.createTestEnv = createTestEnv;


/** @type {!Function} */
exports.cleanUp = cleanUp;
