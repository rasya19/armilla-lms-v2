import { createVercelHandler } from "../backend/vercel-handler.js";

export default createVercelHandler(async () => (await import("../backend/server.js")).default);
