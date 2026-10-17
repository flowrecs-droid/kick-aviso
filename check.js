async function sendDiscord(channel) {
  const stream = channel.stream || {};
  const url = `https://kick.com/${SLUG}`;
  const title = channel.stream_title || "¡Directo en marcha!";
  const viewers = typeof stream.viewer_count === "number" ? stream.viewer_count : 0;

  const embed = {
    author: { name: `🔴 ${SLUG.toUpperCase()} • EN DIRECTO`, url },
    title,
    url,
    description:
      `**¡Ya estoy en directo!** Pásate por el chat y no te pierdas nada 💚\n\n` +
      `▶️ **[Entrar al directo en Kick](${url})**`,
    color: 0x53fc18,
    fields: [],
    footer: { text: `Kick • ${SLUG}` },
    timestamp: new Date().toISOString(),
  };

  if (channel.category?.name)
    embed.fields.push({ name: "🎮 Jugando a", value: channel.category.name, inline: true });
  if (viewers > 0)
    embed.fields.push({ name: "👀 Viendo ahora", value: String(viewers), inline: true });
  if (stream.thumbnail)
    embed.image = { url: `${stream.thumbnail}${stream.thumbnail.includes("?") ? "&" : "?"}t=${Date.now()}` };
  if (channel.banner_picture) embed.thumbnail = { url: channel.banner_picture };

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Aviso de directo",
      content: `${MENTION} 🔴 **${SLUG}** acaba de empezar directo, ¡ven a verlo! 👇`.trim(),
      embeds: [embed],
      allowed_mentions: { parse: MENTION ? ["everyone"] : [] },
    }),
  });
  if (!res.ok) throw new Error(`Discord: ${res.status} ${await res.text()}`);
}
