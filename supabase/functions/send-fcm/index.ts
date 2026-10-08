import { SignJWT, importPKCS8 } from "npm:jose@5.10.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fcm-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function env(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function accessToken() {
  const projectId = env("FIREBASE_PROJECT_ID");
  const clientEmail = env("FIREBASE_CLIENT_EMAIL");
  const privateKey = env("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const key = await importPKCS8(privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Google OAuth failed: ${JSON.stringify(data)}`);
  return { token: data.access_token as string, projectId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secret = Deno.env.get("FCM_WEBHOOK_SECRET");
    if (secret && req.headers.get("x-fcm-webhook-secret") !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "content-type": "application/json" } });
    }

    const body = await req.json();
    const record = body.record ?? body;
    const userId = record.user_id;
    const title = record.title || "Sổ Nợ";
    const notificationBody = record.body || "Bạn có thông báo mới.";
    const data = { ...(record.data || {}), title: String(title), body: String(notificationBody) };
    if (!userId) throw new Error("Missing user_id");

    const supabaseUrl = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const q = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&provider=eq.fcm&select=fcm_token`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!q.ok) throw new Error(`Supabase token lookup failed: ${await q.text()}`);
    const rows = await q.json();
    const tokens = [...new Set((rows || []).map((x: any) => x.fcm_token).filter(Boolean))];
    if (!tokens.length) return new Response(JSON.stringify({ sent: 0, reason: "no_fcm_tokens" }), { headers: { ...cors, "content-type": "application/json" } });

    const { token, projectId } = await accessToken();
    let sent = 0;
    const errors: unknown[] = [];
    for (const fcmToken of tokens) {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ message: { token: fcmToken, notification: { title, body: notificationBody }, data: Object.fromEntries(Object.entries(data).map(([k,v]) => [k, String(v)])), android: { priority: "HIGH", notification: { channel_id: "sono_notifications" } } } }),
      });
      if (r.ok) sent++;
      else errors.push(await r.text());
    }
    return new Response(JSON.stringify({ sent, total: tokens.length, errors }), { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...cors, "content-type": "application/json" } });
  }
});
