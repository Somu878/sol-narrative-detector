export const logBuffer: string[] = [];

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

export { originalConsoleLog };

export function resetLogBuffer(): void {
    logBuffer.length = 0;
}

console.log = (...args: any[]) => {
    const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    logBuffer.push(line);
    originalConsoleLog.apply(console, args);
};

console.error = (...args: any[]) => {
    const line = "❌ " + args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    logBuffer.push(line);
    originalConsoleError.apply(console, args);
};
