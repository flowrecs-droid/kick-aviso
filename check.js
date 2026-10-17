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

async function postToDiscord(payload) {
  // with_components=true permite enviar botones de enlace desde un webhook
  const hookUrl = new URL(DISCORD_WEBHOOK_URL);
  hookUrl.searchParams.set("with_components", "true");
  return fetch(hookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function sendDiscord(channel) {
  const stream = channel.stream || {};
  const url = `https://kick.com/${SLUG}`;
  const title = channel.stream_title || "¡Directo en marcha!";
  const viewers = typeof stream.viewer_count === "number" ? stream.viewer_count : 0;

  // Tu imagen fija, alojada en este mismo repositorio
  const THUMB_URL = "https://raw.githubusercontent.com/flowrecs-droid/kick-aviso/main/miniatura.png";

  // Hora de inicio del directo (para mostrar "hace X minutos")
  const startMs = stream.start_time ? new Date(stream.start_time).getTime() : NaN;
  const startUnix = Math.floor((Number.isFinite(startMs) ? startMs : Date.now()) / 1000);

  const embed = {
    author: { name: `🔴  ${SLUG.toUpperCase()}  •  EN DIRECTO EN KICK`, url },
    title: `🖋️ ${title}`,
    url,
    description:
      `### 💚 ¡Ya estamos en directo!\n` +
      `> Pásate por el chat, saluda y disfruta del stream con la comunidad.\n` +
      `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
      `-# ✨ Entra ahora y no te pierdas nada`,
    color: 0x53fc18,
    fields: [],
    image: { url: THUMB_URL },
    footer: { text: "Hugx Tattoo • Directo en Kick", icon_url: THUMB_URL },
    timestamp: new Date().toISOString(),
  };

  if (channel.category?.name)
    embed.fields.push({ name: "🎮 Categoría", value: `**${channel.category.name}**`, inline: true });
  if (viewers > 0)
    embed.fields.push({ name: "👀 Viendo ahora", value: `**${viewers}**`, inline: true });
  embed.fields.push({ name: "⏱️ Empezó", value: `<t:${startUnix}:R>`, inline: true });
  embed.fields.push({ name: "💬 Chat", value: `[**Entrar al chat**](${url})`, inline: true });

  const payload = {
    username: "Hugx Tattoo Avisos",
    content: `${MENTION} YA ESTAMOS **EN DIRECTO**! ENTRA Y SALUDA 👋🏼💚`.trim(),
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: "Ir al stream", emoji: { name: "🟢" }, url },
        ],
      },
    ],
    allowed_mentions: { parse: MENTION ? ["everyone"] : [] },
  };

  let res = await postToDiscord(payload);

  if (!res.ok && res.status === 400) {
    console.warn(`Botón rechazado (${await res.text()}), reenviando sin botón`);
    delete payload.components;
    res = await postToDiscord(payload);
  }
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
