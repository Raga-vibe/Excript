function isPublicSupabaseKey(key) {
  if (/^sb_publishable_[a-zA-Z0-9_-]+$/.test(key)) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.role === "anon";
  } catch {
    return false;
  }
}

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Only GET requests are supported." });
  }

  const url = process.env.SUPABASE_URL || "";
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (!url || !publishableKey) {
    return res.status(503).json({ configured: false, error: "Supabase project settings are not configured yet." });
  }

  if (!isPublicSupabaseKey(publishableKey)) {
    return res.status(500).json({ configured: false, error: "Use the Supabase publishable key or anon key. Secret keys are not sent to the browser." });
  }

  return res.status(200).json({ configured: true, url, publishableKey });
};
