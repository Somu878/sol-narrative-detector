export const logBuffer: string[] = [];

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Re-export originals so telegram.ts can log without recursion
export { originalConsoleLog };

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
