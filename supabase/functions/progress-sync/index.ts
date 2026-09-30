import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import lessonIds from "./lesson-ids.json" with { type: "json" };

const allowedLessonIds = new Set<string>(lessonIds as string[]);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};
const encoder = new TextEncoder();
const ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
type ProgressEntry = { completed:boolean; firstStartedAt:string|null; completedAt:string|null; lastActivityAt:string; revisionId?:string };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers:corsHeaders }); }
function validDate(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)); }
function compactId(value: unknown): string { return String(value || "").toUpperCase().replace(/[\s-]/g, ""); }
function validToken(value: unknown): value is string { return /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{32}$/.test(compactId(value)); }
function validPairingCode(value: unknown): value is string { return /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{12}$/.test(compactId(value)); }
function sanitizeProgress(value: unknown): Record<string, ProgressEntry> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid progress object");
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 495) throw new Error("Too many lesson records");
  const result: Record<string, ProgressEntry> = {};
  for (const [id, raw] of entries) {
    if (!allowedLessonIds.has(id) || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const firstStartedAt = entry.firstStartedAt === null ? null : validDate(entry.firstStartedAt) ? new Date(entry.firstStartedAt).toISOString() : null;
    const completedAt = entry.completedAt === null ? null : validDate(entry.completedAt) ? new Date(entry.completedAt).toISOString() : null;
    if (!validDate(entry.lastActivityAt)) continue;
    const completed = entry.completed === true && Boolean(completedAt);
    result[id] = { completed, firstStartedAt, completedAt:completed ? new Date(completedAt!).toISOString() : null, lastActivityAt:new Date(entry.lastActivityAt).toISOString(), revisionId:typeof entry.revisionId === "string" ? entry.revisionId.slice(0, 40) : "" };
  }
  return result;
}
async function digest(value: string): Promise<string> {
  const hashed = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(hashed), byte => byte.toString(16).padStart(2, "0")).join("");
}
function makeToken(byteCount = 20): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  let buffer = 0, bits = 0, out = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; out += ID_ALPHABET[(buffer >>> bits) & 31]; }
  }
  return out;
}
function cleanName(value: unknown): string { return String(value || "Device").replace(/[<>\r\n]/g, "").slice(0, 40) || "Device"; }
async function getServiceClient(): Promise<SupabaseClient> {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Sync service is not configured");
  return createClient(url, key, { auth:{ persistSession:false, autoRefreshToken:false } });
}
async function resolveCredential(client: SupabaseClient, credential: string, deviceId: string, name: string) {
  if (!validToken(credential)) throw new Error("Invalid device session");
  const tokenHash = await digest(compactId(credential));
  const { data:device, error } = await client.from("a2z_sync_devices").select("tracker_hash,is_owner,revoked_at").eq("token_hash", tokenHash).maybeSingle();
  if (error) throw error;
  if (device) {
    if (device.revoked_at) throw new Error("This device is no longer connected");
    await client.from("a2z_sync_devices").update({ last_seen_at:new Date().toISOString() }).eq("token_hash", tokenHash);
    return { trackerHash:device.tracker_hash as string, isOwner:Boolean(device.is_owner), tokenHash };
  }
  // The primary device's local 160-bit secret defines the private progress space.
  const { error:upsertError } = await client.from("a2z_sync_devices").upsert({ tracker_hash:tokenHash, device_id:deviceId, token_hash:tokenHash, device_name:name, is_owner:true, last_seen_at:new Date().toISOString(), revoked_at:null }, { onConflict:"tracker_hash,device_id" });
  if (upsertError) throw upsertError;
  return { trackerHash:tokenHash, isOwner:true, tokenHash };
}
async function getDevices(client: SupabaseClient, trackerHash: string) {
  const { data, error } = await client.from("a2z_sync_devices").select("device_id,device_name,is_owner,last_seen_at").eq("tracker_hash", trackerHash).is("revoked_at", null).order("created_at");
  if (error) throw error;
  return (data || []).map((item:Record<string, unknown>) => ({ deviceId:item.device_id, deviceName:item.device_name, isOwner:item.is_owner, lastSeenAt:item.last_seen_at }));
}
async function merge(client: SupabaseClient, trackerHash: string, progress: Record<string, ProgressEntry>) {
  const { data, error } = await client.rpc("merge_a2z_progress", { p_sync_id_hash:trackerHash, p_progress:progress });
  if (error) throw error;
  return sanitizeProgress(data || {});
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers:corsHeaders });
  if (request.method !== "POST") return json({ error:"Use POST" }, 405);
  try {
    const body = await request.json();
    if (encoder.encode(JSON.stringify(body)).length > 300_000) return json({ error:"Request too large" }, 413);
    const client = await getServiceClient();
    const action = String(body.action || "sync");
    const deviceId = String(body.deviceId || "").toLowerCase();
    const name = cleanName(body.deviceName);

    if (action === "create_pairing") {
      if (!validToken(body.credential) || !/^[a-f0-9]{32}$/.test(deviceId)) return json({ error:"Invalid primary device" }, 400);
      const resolved = await resolveCredential(client, compactId(body.credential), deviceId, name);
      if (!resolved.isOwner) return json({ error:"Only the primary device can pair another device" }, 403);
      const pairingToken = makeToken();
      const pairingCode = makeToken(8).slice(0, 12);
      const { data:expiresAt, error } = await client.rpc("create_a2z_pairing_session", { p_tracker_hash:resolved.trackerHash, p_token_hash:await digest(pairingToken), p_pairing_code_hash:await digest(pairingCode) });
      if (error) throw error;
      return json({ pairingToken, pairingCode, expiresAt });
    }

    if (action === "complete_pairing") {
      const pairingToken = validToken(body.pairingToken) ? compactId(body.pairingToken) : null;
      const pairingCode = validPairingCode(body.pairingCode) ? compactId(body.pairingCode) : null;
      if ((!pairingToken && !pairingCode) || !/^[a-f0-9]{32}$/.test(deviceId)) return json({ error:"Invalid pairing code" }, 400);
      const deviceCredential = makeToken();
      const { data:pairing, error } = await client.rpc("consume_a2z_pairing", { p_token_hash:pairingToken ? await digest(pairingToken) : null, p_pairing_code_hash:pairingCode ? await digest(pairingCode) : null, p_device_hash:await digest(deviceCredential), p_device_id:deviceId, p_device_name:name });
      if (error || !pairing?.trackerHash) return json({ error:"Pairing code expired or already used" }, 410);
      const trackerHash = String(pairing.trackerHash);
      const progress = await merge(client, trackerHash, {});
      return json({ schemaVersion:2, deviceCredential, pairedAt:pairing.pairedAt, progress, devices:await getDevices(client, trackerHash), syncedAt:new Date().toISOString() });
    }

    if (action !== "sync" || !/^[a-f0-9]{32}$/.test(deviceId) || !validToken(body.credential)) return json({ error:"Invalid sync request" }, 400);
    const resolved = await resolveCredential(client, compactId(body.credential), deviceId, name);
    const incoming = sanitizeProgress(body.progress || {});
    const progress = await merge(client, resolved.trackerHash, incoming);
    return json({ schemaVersion:2, progress, devices:await getDevices(client, resolved.trackerHash), syncedAt:new Date().toISOString() });
  } catch (error) {
    console.error("progress-sync request failed", error instanceof Error ? error.message : "unknown error");
    return json({ error:"Could not complete device sync" }, 400);
  }
});
