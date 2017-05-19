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

To run:
`GOOGLE_APPLICATION_CREDENTIALS=service_account.json xlifftranslate --i18nPath src/i18n`

[npm-badge]: https://img.shields.io/npm/v/xlifftranslate.svg
[npm-badge-url]: https://www.npmjs.com/package/xlifftranslate