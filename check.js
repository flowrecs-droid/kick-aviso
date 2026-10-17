
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

  if (!res.ok) {
    throw new Error(`Token Kick: ${res.status} ${await res.text()}`);
  }

  return (await res.json()).access_token;
}

async function getChannel(token) {
  const res = await fetch(
    `https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(SLUG)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Canal Kick: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const channel = Array.isArray(json.data) ? json.data[0] : json.data;

  if (!channel) {
    throw new Error(`No se encontró el canal ${SLUG}`);
  }

  return channel;
}

async function postToDiscord(payload) {
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
  const title = channel.stream_title || "Directo en vivo";

  // Tu miniatura original.
  const THUMB_URL =
    "https://raw.githubusercontent.com/flowrecs-droid/kick-aviso/main/miniatura.png";

  // Escapar caracteres especiales del título.
  const safeTitle = String(title)
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/`/g, "\\`")
    .replace(/\|/g, "\\|");

  // Momento en el que se prepara el aviso.
  const sentUnix = Math.floor(Date.now() / 1000);

  const embed = {
    description: [
      "## ✨ ¡YA ESTAMOS EN DIRECTO!",
      "",
      "La espera ha terminado. 💙",
      "Pásate por el chat, saluda y disfruta del stream con toda la comunidad.",
      "",
      "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬",
      "",
      "### 👇 ¡TE ESPERAMOS DENTRO!",
      "> Entra al directo y forma parte de la comunidad de Hugx Tattoo.",
    ].join("\n"),

    // Se conserva tu color original.
    color: 0x000658,

    fields: [
      ...(channel.category?.name
        ? [
            {
              name: "🎮 CATEGORÍA",
              value: `**${channel.category.name}**`,
              inline: true,
            },
          ]
        : []),

      {
        name: "🕒 AVISO ENVIADO",
        value: `<t:${sentUnix}:R>`,
        inline: true,
      },

    image: {
      url: THUMB_URL,
    },

    footer: {
      text: "Hugx Tattoo @HugxTattoo en Kick 💚",
    },

    timestamp: new Date().toISOString(),
  };

  const payload = {
    username: "Hugx Tattoo Avisos",

    content: `${MENTION} ¡YA ESTAMOS **EN DIRECTO**! ENTRA Y SALUDA 👋🏼💚`.trim(),

    embeds: [embed],

    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "Ir al stream",
            emoji: { name: "🟢" },
            url,
          },
        ],
      },
    ],

    allowed_mentions: {
      parse: MENTION.includes("@everyone")
        ? ["everyone"]
        : MENTION.includes("@here")
          ? ["here"]
          : [],
    },
  };

  let res = await postToDiscord(payload);

  if (!res.ok && res.status === 400) {
    const error = await res.text();

    console.warn(
      `Error al enviar el botón o el embed (${error}). Reintentando sin botón.`
    );

    delete payload.components;
    res = await postToDiscord(payload);
  }

  if (!res.ok) {
    throw new Error(`Discord: ${res.status} ${await res.text()}`);
  }
}

const token = await getToken();
const channel = await getChannel(token);
const isLive = Boolean(channel.stream?.is_live);

console.log(
  `${SLUG}: ${isLive ? "EN DIRECTO" : "offline"} (antes: ${
    state.live ? "directo" : "offline"
  })`
);

if (FORCE) {
  await sendDiscord(channel);
  console.log("Aviso de prueba enviado");
} else if (isLive && !state.live) {
  await sendDiscord(channel);
  console.log("Aviso enviado");
}

if (!FORCE) {
  state.live = isLive;
}

writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
