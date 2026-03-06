const { Client, GatewayIntentBits, AuditLogEvent, PermissionsBitField } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ✅ Your Owner ID
const OWNERS = ["1405447087423885312"];

// ✅ Multiple Log Channels
const LOG_CHANNEL_IDS = ["1273905379344121907", "1479081747928059912","1466746074772406418","1456662786577928286","1276743719688601660"];

const badWords = ["gomma", "punda", "thevudiya", "sunni", "gotha","fuck","suthu","ass","fucker","umbu"];

const messageTracker = new Map();
const channelTracker = new Map();

client.once("ready", () => {
  console.log(`🔥 Security Bot Online as ${client.user.tag}`);
});

// ✅ Protected Users
function isProtected(member) {
  if (OWNERS.includes(member.id)) return true;

  if (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  ) return true;

  return false;
}

// ✅ Send Logs
function sendLog(guild, msg) {
  LOG_CHANNEL_IDS.forEach(id => {
    const channel = guild.channels.cache.get(id);
    if (channel) channel.send(msg);
  });
}

// 🔨 Ban Function
async function banUser(member, reason, content) {
  if (!member.bannable) return;

  await member.ban({ reason });

  sendLog(
    member.guild,
    `🔨 BANNED: ${member.user.tag}\nReason: ${reason}\nMessage: ${content || "N/A"}`
  );
}

// 📩 Message Protection
client.on("messageCreate", async (message) => {

  if (!message.guild || message.author.bot) return;

  const member = message.member;

  if (isProtected(member)) return;

  const text = message.content.toLowerCase();

  // 🔗 Link Protection
  if (text.includes("http://") || text.includes("https://") || text.includes("www.")) {

    await message.delete().catch(()=>{});

    return banUser(member,"Unauthorized Link Sharing",message.content);

  }

  // 🤬 Bad Words
  if (badWords.some(word => text.includes(word))) {

    await message.delete().catch(()=>{});

    return banUser(member,"Inappropriate Language",message.content);

  }

  // 📢 Spam Detection
  const id = member.id;

  if (!messageTracker.has(id)) messageTracker.set(id, []);

  const data = messageTracker.get(id);

  data.push({
    content: message.content,
    time: Date.now()
  });

  const filtered = data.filter(m => Date.now() - m.time < 5000);

  messageTracker.set(id, filtered);

  const same = filtered.filter(m => m.content === message.content);

  if (same.length > 4) {

    await message.delete().catch(()=>{});

    return banUser(member,"Message Spam",message.content);

  }

});

// 🤖 Anti Bot Add
client.on("guildMemberAdd", async (member) => {

  if (!member.user.bot) return;

  const logs = await member.guild.fetchAuditLogs({
    type: AuditLogEvent.BotAdd,
    limit: 1
  });

  const entry = logs.entries.first();

  if (!entry) return;

  const executor = await member.guild.members.fetch(entry.executor.id);

  if (isProtected(executor)) return;

  await executor.ban({ reason:"Unauthorized Bot Addition" });

  if (member.kickable) {
    await member.kick("Unauthorized Bot Added");
  }

  sendLog(
    member.guild,
    `🚨 Unauthorized Bot Added\n👤 Banned: ${executor.user.tag}\n🤖 Removed Bot: ${member.user.tag}`
  );

});

// 📁 Channel Protection
async function handleChannel(channel,type){

  const logs = await channel.guild.fetchAuditLogs({
    type: type === "create"
      ? AuditLogEvent.ChannelCreate
      : AuditLogEvent.ChannelDelete,
    limit: 1
  });

  const entry = logs.entries.first();

  if (!entry) return;

  const executor = await channel.guild.members.fetch(entry.executor.id);

  if (isProtected(executor)) return;

  if (!channelTracker.has(executor.id)) {

    channelTracker.set(executor.id,[]);

  }

  const actions = channelTracker.get(executor.id);

  actions.push(Date.now());

  const filtered = actions.filter(t => Date.now() - t < 5000);

  channelTracker.set(executor.id, filtered);

  if (filtered.length > 3) {

    await executor.ban({ reason:"Channel Abuse" });

    sendLog(
      channel.guild,
      `📁 CHANNEL ABUSE\nUser: ${executor.user.tag} banned`
    );

    channelTracker.delete(executor.id);

  }

}

client.on("channelCreate",channel => handleChannel(channel,"create"));
client.on("channelDelete",channel => handleChannel(channel,"delete"));

client.login(process.env.TOKEN);
