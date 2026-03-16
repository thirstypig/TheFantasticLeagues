import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { logger } from "./logger.js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  logger.warn({}, "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server environment.");
}

export const supabaseAdmin = createClient(
  supabaseUrl || "",
  supabaseServiceKey || "",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
