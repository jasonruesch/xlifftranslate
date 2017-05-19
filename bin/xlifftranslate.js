#!/usr/bin/env node

// Run with: GOOGLE_APPLICATION_CREDENTIALS=service_account.json xlifftranslate

var Liftoff = require('liftoff');
var argv = require('minimist')(process.argv.slice(2));
var cheerio = require('cheerio');
var fs = require('fs');
var path = require('path');
var runAsync = require("async");
var Translate = require('@google-cloud/translate');
var translate = Translate();

var XliffTranslate = new Liftoff({
  name: 'xlifftranslate',
  configName: 'xlifftranslate.json',
  extensions: require('interpret').jsVariants,
  v8flags: ['--harmony']
}).on('require', function (name, module) {
  console.log('Loading:', name);
}).on('requireFail', function (name, err) {
  console.log('Unable to load:', name, err);
}).on('respawn', function (flags, child) {
  console.log('Detected node flags:', flags);
  console.log('Respawned to PID:', child.pid);
});

XliffTranslate.launch({
  cwd: argv.cwd,
  configPath: argv.configPath,
  require: argv.require,
  completion: argv.completion,
  verbose: argv.verbose
}, invoke);

function invoke(env) {

  if (argv.verbose) {
    console.log('LIFTOFF SETTINGS:', this);
    console.log('CLI OPTIONS:', argv);
    console.log('CWD:', env.cwd);
    console.log('LOCAL MODULES PRELOADED:', env.require);
    console.log('SEARCHING FOR:', env.configNameRegex);
    console.log('FOUND CONFIG AT:',  env.configPath);
    console.log('CONFIG BASE DIR:', env.configBase);
    console.log('YOUR LOCAL MODULE IS LOCATED:', env.modulePath);
    console.log('LOCAL PACKAGE.JSON:', env.modulePackage);
    console.log('CLI PACKAGE.JSON', require('../package'));
  }

  if (process.cwd() !== env.cwd) {
    process.chdir(env.cwd);
    console.log('Working directory changed to', env.cwd);
  }

  run();
}

function run() {

  var i18nPath = './src/i18n';
  fs.readdir(i18nPath, function (err, files) {
    if (err) {
      console.error('Could not list the directory.', err);
      process.exit(1);
    }
    
    files.forEach(function (file, index) {
      var fileParts = file.split('.');
      if (!file.startsWith('messages.') || fileParts.length < 3) {
        return;
      }

      var tasks = [];
      var locale = fileParts[1];
      locale = locale === 'en-GB' ? 'en' : locale;
      var filePath = path.join(i18nPath, file);
      var html = fs.readFileSync(filePath).toString();
      var $ = cheerio.load(html, {
        xmlMode: true,
        decodeEntities: false
      });

      let transNodes = [];

      $("trans-unit").each(function () {
        var node = $(this);
        transNodes.push(node);
      });

      $("file").attr('target-language', locale);

      $("trans-unit").each(function () {
        var node = $(this);

        if (-1 === getNodeIndexFromNodeList(transNodes, node)) {
          node.remove();
        } else {
          removeNodeFromList(transNodes, node);
        }
      });

      for (elem of transNodes) {
        $("body").append(elem);
      }

      // Translate
      $("trans-unit").each(function () {
        var node = $(this);
        var text = node.find('source').html();
        tasks.push(function () {
          return function (callback) {
            var target = node.find('target');
            if (target.attr('state') === 'translated') {
              callback();
              return;
            }
            translate.translate(text.replace('<x id="INTERPOLATION"/>', '<_______>'), locale).then(function (results) {
              var translations = results[0];
              var translation = Array.isArray(translations) ? translations[0] : translations;
              translation = translation.replace('<_______>', '<x id="INTERPOLATION"/>');
              console.log(`${locale}: ${text} => ${translation}`);
              target.attr('xml:lang', locale);
              target.attr('state', 'translated');
              target.html(translation);
              callback();
            }).catch(function (err) {
              if (err.code === 400) {
                console.error(`Error: ${locale} is not a valid locale`);
              } else {
                console.error(err);
              }
              callback();
            });
          }
        } ());
      });
      runAsync.parallel(tasks, function () {
        fs.writeFileSync(filePath, $.xml());
      });
    });
  });
}

function getNodeIndexFromNodeList(nodeList, node) {
  for (var i = 0, iLen = nodeList.length; i < iLen; i++) {
    if (nodeList[i].attr("id") == node.attr("id")) {
      return i;
    }
  }
  return -1;
}

function removeNodeFromList(nodeList, node) {
  return nodeList.splice(getNodeIndexFromNodeList(nodeList, node), 1);
}
