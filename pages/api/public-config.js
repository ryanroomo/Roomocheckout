/**
 * GET /api/public-config
 *
 * Returns the PUBLIC Supabase config for the browser (account.html). The anon
 * key is safe to expose — it only grants what Row Level Security allows and is
 * designed to live in client code. (Never return the service role key here.)
 */
export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    supabaseUrl:
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  });
}
