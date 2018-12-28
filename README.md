[![npm][npm-badge]][npm-badge-url]

# xlifftranslate
> Translate xliff files using the Google Cloud Translation API

### How to use it

1. Install globally with `npm install -g xlifftranslate`.
2. Follow the instructions at https://developers.google.com/identity/protocols/application-default-credentials to setup your google application credentials.
3. Run `xlifftranslate` in your project directory.

#### Options
- `--i18nPath` specify the directory where the xliff files are found

### Examples

> To run, make sure your Google Translate API Credendials are in your environment:

`export GOOGLE_APPLICATION_CREDENTIALS=service_account.json` 

> Example run command

`xlifftranslate --i18nPath src/i18n`

#### Additional options:
- `--verbose` adds verbose output with translations.
- `--ignoreText "ignoreme ignoremetoo"` ignores the specified strings with default delimiter " ".
- `--ignoreDelimiter " "` Specify the delimiter for the --ignoreText optionl
- `--skipDifferent "true"` Skip translations of strings where <source> and <target> don't match. 

[npm-badge]: https://img.shields.io/npm/v/xlifftranslate.svg
[npm-badge-url]: https://www.npmjs.com/package/xlifftranslate
