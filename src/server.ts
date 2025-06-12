import { serve } from "bun";
import app from "./index"; 

serve({
  fetch: app.fetch,
  port: 3000,
  hostname: "0.0.0.0", // penting untuk Replit
});

console.log("✅ Server running on http://0.0.0.0:3000");
