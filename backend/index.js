import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

app.get("/health", async (_req, res) => {
  const { error } = await supabase.storage.listBuckets();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

const port = process.env.PORT || 5171;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
