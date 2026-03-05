const { Client, GatewayIntentBits, AuditLogEvent, PermissionsBitField } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// 🔥 ADD YOUR OWNER IDs HERE
const OWNERS = ["1405447087423885312"];

// 🔥 ADD YOUR LOG CHANNEL ID
const LOG_CHANNEL_ID = ["1467878373119365347","1479081747928059912"];

const badWords = ["gomma", "punda", "thevudiya","sunni","gotha"];

const messageTracker = new Map();
const channelTracker = new Map();

client.once("ready", () => {
  console.log(`🔥 Security Bot Online as ${client.user.tag}`);
});

// ✅ Protected Users (Owner + Admin + Manage Server)
function isProtected(member) {
  if (OWNERS.includes(member.id)) return true;

  if (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  ) return true;

  return false;
}

// 🔨 Ban Function
async function banUser(member, reason, content) {
  if (!member.bannable) return;

  await member.ban({ reason });

  const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
  logChannel?.send(
    `🔨 BANNED: ${member.user.tag}\nReason: ${reason}\nMessage: ${content || "N/A"}`
  );
}

// 📩 Message Protection
client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;

  const member = message.member;
  if (isProtected(member)) return;

  const lower = message.content.toLowerCase();

  // 🔗 Link Protection
  if (lower.includes("http://") || lower.includes("https://") || lower.includes("www.")) {
    await message.delete();
    return banUser(member, "Unauthorized Link Sharing", message.content);
  }

  // 🤬 Bad Words
  if (badWords.some(word => lower.includes(word))) {
    await message.delete();
    return banUser(member, "Inappropriate Language", message.content);
  }

  // 📢 Spam Protection (>4 in 5 sec)
  const userId = member.id;

  if (!messageTracker.has(userId)) messageTracker.set(userId, []);

  const messages = messageTracker.get(userId);
  messages.push({ content: message.content, time: Date.now() });

  messageTracker.set(
    userId,
    messages.filter(m => Date.now() - m.time < 5000)
  );

  const sameMessages = messages.filter(m => m.content === message.content);

  if (sameMessages.length > 4) {
    return banUser(member, "Message Spam", message.content);
  }
});

// 🤖 Anti Bot Add
client.on("guildMemberAdd", async (member) => {
  if (!member.user.bot) return;

  const logs = await member.guild.fetchAuditLogs({
    type: AuditLogEvent.BotAdd,
    limit: 1,
  });

  const entry = logs.entries.first();
  if (!entry) return;

  const executor = await member.guild.members.fetch(entry.executor.id);

  if (isProtected(executor)) return;

  await executor.ban({ reason: "Unauthorized Bot Addition" });

  const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
  logChannel?.send(`🤖 BOT ADD VIOLATION: ${executor.user.tag} banned`);
});

// 📁 Channel Create/Delete Protection
async function handleChannel(channel, type) {
  const logs = await channel.guild.fetchAuditLogs({
    type: type === "create" ? AuditLogEvent.ChannelCreate : AuditLogEvent.ChannelDelete,
    limit: 1,
  });

  const entry = logs.entries.first();
  if (!entry) return;

  const executor = await channel.guild.members.fetch(entry.executor.id);

  if (isProtected(executor)) return;

  if (!channelTracker.has(executor.id))
    channelTracker.set(executor.id, []);

  const actions = channelTracker.get(executor.id);
  actions.push(Date.now());

  channelTracker.set(
    executor.id,
    actions.filter(t => Date.now() - t < 5000)
  );

  if (actions.length > 3) {
    await executor.ban({ reason: "Channel Abuse" });

    const logChannel = channel.guild.channels.cache.get(LOG_CHANNEL_ID);
    logChannel?.send(`📁 CHANNEL ABUSE: ${executor.user.tag} banned`);

    channelTracker.delete(executor.id);
  }
}

client.on("channelCreate", (channel) => handleChannel(channel, "create"));
client.on("channelDelete", (channel) => handleChannel(channel, "delete"));

client.login(process.env.TOKEN);
