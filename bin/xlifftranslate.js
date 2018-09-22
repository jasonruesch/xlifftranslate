#!/usr/bin/env node

var Liftoff = require('liftoff');
var argv = require('minimist')(process.argv.slice(2));
var cheerio = require('cheerio');
var fs = require('fs');
var path = require('path');
var runAsync = require("async");
var Translate = require('@google-cloud/translate');
var translate = Translate();

var XliffTranslate = new Liftoff({
  name: 'xlifftranslate'
});

XliffTranslate.launch({
  verbose: argv.verbose
}, invoke);

function invoke(env) {

  if (argv.verbose) {
    console.log('LIFTOFF SETTINGS:', this);
    console.log('CLI OPTIONS:', argv);
    console.log('CWD:', env.cwd);
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

  var i18nPath = argv.i18nPath || process.cwd();
  fs.readdir(i18nPath, function (err, files) {
    if (err) {
      console.error('Could not list the directory.', err);
      process.exit(1);
    }
    
    files.forEach(function (file, index) {
      var fileParts = file.split('.');
      // Look for locale in filename (e.g. messages.de.xliff)
      if (fileParts.length < 3) {
        return;
      }

      var tasks = [];
      var locale = fileParts[1];
      var lang = locale;
      if (lang.indexOf('-') !== -1) {
        lang = lang.split('-')[0];
      }
      if (lang.indexOf('_') !== -1) {
        lang = lang.split('_')[0];
      }
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
            if (target.length == 0) {
              node.append('<target></target>');
              target = node.find('target');
            }
            if (target.attr('state') === 'translated') {
              callback();
              return;
            }
            translate.translate(text.replace('<x id="INTERPOLATION"/>', '<_______>'), lang).then(function (results) {
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
