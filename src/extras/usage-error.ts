// Wrong arguments end in the usage text and exit code 1, after the reason
// when there is one to give. Both of those sit here, apart from the reading
// of the arguments, so that whatever checks a value can refuse it without
// reaching for the rest.

export class UsageError extends Error {
}

export const USAGE = `Usage: test-assert [options] <file...>
  -v, --version               print this package's version
  --alias <specifier>=<file>  ES module a specifier resolves to, a node: builtin too (repeatable)
  --import-map <file>         JSON import map: a relative address is a file beside it, / and http(s):// go to the page as they are
  --serve                     serve the suite for a browser and print the URL; the page reloads on a change
  --host <address>            address the server listens on (browser modes, default: 127.0.0.1)
  --port <number>             port the server listens on (browser modes, default: a free one)
  --origin <url>              what the browser reaches the server as, http(s)://host[:port] (browser modes, default: from --host)
  --script <file>             classic script to run first (browser modes, repeatable)
  --mount <dir|url>           what the root serves instead of htdocs: a directory, or an origin to proxy (browser modes)
  --webdriver                 run the suite through a WebDriver server: safaridriver, chromedriver
  --webdriver-session <file>  JSON sent as the body of POST /session (default: no capabilities)
  --endpoint <url>            the WebDriver server (default: http://127.0.0.1:4444)
  --playwright <browser>      run the suite through Playwright: chromium, firefox or webkit
`
