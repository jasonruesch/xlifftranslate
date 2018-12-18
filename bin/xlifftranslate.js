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
          if (fileParts.length == 2) {
              var newFileParts = ['whocares', fileParts[0], fileParts[1]];
              fileParts = newFileParts;
          }
          else {
            console.log('Error, expecting three part filename like something.en.xliff');
            return;
          }
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
      console.log('Language: ' + lang);
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
        //console.log(this);
	    //console.log(node.html());
          // console.log(node.find('source'));
        var text = node.find('source').html();
        //console.log(text);
        tasks.push(function () {
          return function (callback) {
            var source = node.find('source');
            var target = node.find('target');
//            if (target.length == 0) {
//              node.append('<target/>');
//              target = node.find('target');
//            }
            if (target.attr('state') === 'translated' ) {
              callback();
              return;
            }

            text = text.replace('<x id="INTERPOLATION"/>', '<_______>');
            text = text.replace('%@', '<______>');
            text = text.replace('%d', '<_____>');
            text = text.replace('%f', '<____>');
            text = text.replace('%1$d:%2$02d', '<___>');
            text = text.replace('%2$@', '<__>');
            text = text.replace('%1$d', '<_>');

            translate.translate(text, lang).then(function (results) {
              var translations = results[0];
              var translation = Array.isArray(translations) ? translations[0] : translations;

              translation = translation.replace('<_______>', '<x id="INTERPOLATION"/>');
              translation = translation.replace('<______>', '%@');
              translation = translation.replace('<_____>', '%d');
              translation = translation.replace('<____>', '%f');
              translation = translation.replace('<___>', '%1$d:%2$02d');
              translation = translation.replace('<__>', '%2$@');
              translation = translation.replace('<_>', '%1$d');

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
    var nodeListId = nodeList[i].attr("id");
    var nodeId = node.attr("id");
    if (nodeListId == nodeId) {
      return i;
    }
  }
  return -1;
}

function removeNodeFromList(nodeList, node) {
  return nodeList.splice(getNodeIndexFromNodeList(nodeList, node), 1);
}
