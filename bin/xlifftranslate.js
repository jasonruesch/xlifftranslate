#!/usr/bin/env node

var Liftoff = require('liftoff');
var argv = require('minimist')(process.argv.slice(2));
var cheerio = require('cheerio');
var fs = require('fs');
var path = require('path');
var async = require('async');
var sleep = require('sleep')
var Translate = require('@google-cloud/translate');
var translate = Translate();

var XliffTranslate = new Liftoff({
  name: 'xlifftranslate'
});

XliffTranslate.launch({
  verbose: argv.verbose
}, invoke);

// Primary entry point. Print app settings.
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

// Secondary entry point. Run the program.
function run() {

  // Parse All Command Arguments, set defaults if unset.
  var ignoreTextArgv = argv.ignoreText || '';
  var ignoreDelimiter = argv.ignoreDelimiter || ' ';
  var verbose = argv.verbose === 'true' ||
      argv.verbose === "true" ||
      argv.verbose === true || false;
  var ignoreText = ignoreTextArgv.split(ignoreDelimiter);
  ignoreText.push('<x id="INTERPOLATION"/>');

  var skipDifferent = argv.skipDifferent === 'true' ||
      argv.skipDifferent === "true" ||
      argv.skipDifferent === true || false;

  var i18nPath = argv.i18nPath || process.cwd();

  // Start by reading the directory for translation files.
  fs.readdir(i18nPath, function (err, files) {

    if (err) {
      console.error('Could not list the directory.', err);
      process.exit(1);
    }
    
    // START: Process each file.
    files.forEach(function (file, index) {

      // Look for locale/lang in filename (e.g. messages.de.xliff)
      var fileParts = file.split('.');
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

      var locale = fileParts[1];
      var lang = locale;
      if (lang.indexOf('-') !== -1) {
        lang = lang.split('-')[0];
      }
      if (lang.indexOf('_') !== -1) {
        lang = lang.split('_')[0];
      }
      if (verbose) {
          console.log('Language found: ' + lang);
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

      // Define a worker queue with defined translating callback function.
      var q = async.queue(function (task, callback) {
        var node = task.node
        var text = node.find('source').html();
        var source = node.find('source');
        var target = node.find('target');
        if (target.attr('state') === 'translated' ) {
          callback();
          return;
        }

        // skip if the caller wants to skip source/target that are unequal.
        if (skipDifferent === true && source !== target) {
          console.info("Skipped: " + text + " due to skipDifferent flag");
          callback();
          return;
        }

        text = replaceIgnoreTextWithPlaceholders(ignoreText, text, false);

        translate.translate(text, lang).then(function (results) {
          var translations = results[0];
          var translation = Array.isArray(translations) ? translations[0] : translations;

          translation = replaceIgnoreTextWithPlaceholders(ignoreText, translation, true);
          if (verbose) {
            console.log(`${locale}: ${text} => ${translation}`);
          }
          target.attr('xml:lang', locale);
          target.attr('state', 'translated');
          target.html(translation);
          sleep.usleep(200)
          callback();
        }).catch(function (err) {
          if (err.code === 400) {
            console.error(`Error: ${locale} is not a valid locale`);
          } else {
            console.error(err);
          }
          callback();
        });
      }, 1);

      // Translate - I.E. pass each node to the aync worker pool 'q' in order to run the translation function on the node.
      $("trans-unit").each(function () {
        var node = $(this);
        q.push({'node': node}, function(err) {
          // Precondition, node has been parsed, and xml file has been replaced with translations.
          fs.writeFileSync(filePath, $.xml());
        });
      });
    });
  });
  console.info("Translation Completed");
}

function replaceIgnoreTextWithPlaceholders(ignoreTexts, stringToEdit, reverse) {
  var index = 0;
  ignoreTexts.forEach(function(value) {
    var placeholderTag = getPlaceholderIgnoreTagForIndex(index);
    if (reverse) { // after translation, put ignore strings back.
      stringToEdit = stringToEdit.replace(placeholderTag, value);
    }
    else { // before translation, replace with tag placeholders that will get ignored by GT.
      stringToEdit = stringToEdit.replace(value, placeholderTag);
    }
    index++;
  });
  return stringToEdit;
}

function getPlaceholderIgnoreTagForIndex(index) {
  var baseTag = '<_>';
  for (var i = 0; i <= index; i++) {
    // Create a larger and larger tag for each ignore placeholer. Ex: <_____>
    baseTag = baseTag.slice(0, 1) + '_' + baseTag.slice(1);
  }
  return baseTag;
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
