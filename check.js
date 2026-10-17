import { readFileSync, writeFileSync, existsSync } from "node:fs";

const { KICK_CLIENT_ID, KICK_CLIENT_SECRET, DISCORD_WEBHOOK_URL } = process.env;
const SLUG = process.env.KICK_CHANNEL || "hugxtattoo";
const MENTION = process.env.MENTION ?? "@everyone";
const FORCE = process.env.FORCE === "true";
const STATE_FILE = "state.json";

if (!KICK_CLIENT_ID || !KICK_CLIENT_SECRET || !DISCORD_WEBHOOK_URL) {
  console.error("Faltan secretos: KICK_CLIENT_ID, KICK_CLIENT_SECRET o DISCORD_WEBHOOK_URL");
  process.exit(1);
}

const state = existsSync(STATE_FILE)
  ? JSON.parse(readFileSync(STATE_FILE, "utf8"))
  : { live: false };

async function getToken() {
  const res = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: KICK_CLIENT_ID,
      client_secret: KICK_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Token Kick: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function getChannel(token) {
  const res = await fetch(
    `https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(SLUG)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`Canal Kick: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const channel = Array.isArray(json.data) ? json.data[0] : json.data;
  if (!channel) throw new Error(`No se encontró el canal ${SLUG}`);
  return channel;
}

async function sendDiscord(channel) {
  const stream = channel.stream || {};
  const url = `https://kick.com/${SLUG}`;
  const embed = {
    author: { name: `${SLUG} está en directo en Kick`, url },
    title: channel.stream_title || "¡Directo en marcha!",
    url,
    description: "🔴 **¡Ya estoy en directo! Pásate por el chat** 💚",
    color: 0x53fc18,
    fields: [],
    footer: { text: "Kick • Aviso automático" },
    timestamp: new Date().toISOString(),
  };
  if (channel.category?.name)
    embed.fields.push({ name: "🎮 Categoría", value: channel.category.name, inline: true });
  if (typeof stream.viewer_count === "number")
    embed.fields.push({ name: "👀 Espectadores", value: String(stream.viewer_count), inline: true });
  if (stream.thumbnail)
    embed.image = { url: `${stream.thumbnail}${stream.thumbnail.includes("?") ? "&" : "?"}t=${Date.now()}` };
  if (channel.banner_picture) embed.thumbnail = { url: channel.banner_picture };

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Aviso de directo",
      content: `${MENTION} ¡**${SLUG}** está en directo! ${url}`.trim(),
      embeds: [embed],
      allowed_mentions: { parse: MENTION ? ["everyone"] : [] },
    }),
  });
  if (!res.ok) throw new Error(`Discord: ${res.status} ${await res.text()}`);
}

const token = await getToken();
const channel = await getChannel(token);
const isLive = Boolean(channel.stream?.is_live);
console.log(`${SLUG}: ${isLive ? "EN DIRECTO" : "offline"} (antes: ${state.live ? "directo" : "offline"})`);

if (FORCE) {
  await sendDiscord(channel);
  console.log("Aviso de prueba enviado");
} else if (isLive && !state.live) {
  await sendDiscord(channel);
  console.log("Aviso enviado");
}

if (!FORCE) state.live = isLive;
writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
