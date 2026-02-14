import "dotenv/config";
import "./logger.js";
import { runAgent } from "./agent.js";

// CLI entry point — `npm start` / `npm run dev`
runAgent()
  .then((result) => {
    if (!result.success) {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
