export const hasProcess = (): boolean =>
    "undefined" !== typeof process &&
    "function" === typeof process.stdout?.write
