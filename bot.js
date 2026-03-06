const { Client, GatewayIntentBits, AuditLogEvent, PermissionsBitField } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ✅ Owners
const OWNERS = ["1405447087423885312","1233006477959102580","938513493487931392"];

// ✅ Log Channels
const LOG_CHANNEL_IDS = ["1479081747928059912","1466746074772406418","1456662786577928286","1276743719688601660"];

const badWords = ["gomma","punda","thevudiya","sunni","gotha","fuck","suthu","ass","fucker","umbu"];

const messageTracker = new Map();
const channelTracker = new Map();

client.once("ready", () => {
  console.log(`🔥 Security Bot Online as ${client.user.tag}`);
});

// ✅ Protected users
function isProtected(member){
  if (OWNERS.includes(member.id)) return true;

  if (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  ) return true;

  return false;
}

// ✅ Send logs
function sendLog(guild,msg){
  LOG_CHANNEL_IDS.forEach(id=>{
    const ch = guild.channels.cache.get(id);
    if(ch) ch.send(msg);
  });
}

// ⏳ Timeout function (10 minutes)
async function timeoutUser(member,reason){

  if(!member.moderatable) return;

  await member.timeout(10 * 60 * 1000, reason);

  const msg = `⚠️ <@${member.id}> violated rule: **${reason}**\n⏳ Timeout: 10 minutes`;

  member.guild.channels.cache
    .filter(c => c.isTextBased())
    .forEach(c => c.send(msg).catch(()=>{}));

  sendLog(member.guild,`⏳ TIMEOUT: ${member.user.tag}\nReason: ${reason}`);
}

// 📩 Message Protection
client.on("messageCreate", async message=>{

  if(!message.guild || message.author.bot) return;

  const member = message.member;
  if(isProtected(member)) return;

  const text = message.content.toLowerCase();

  // 🔗 Link rule
  if(text.includes("http://") || text.includes("https://") || text.includes("www.")){

    await message.delete().catch(()=>{});

    return timeoutUser(member,"Sending Links");

  }

  // 🤬 Bad words
  if(badWords.some(w => text.includes(w))){

    await message.delete().catch(()=>{});

    return;

  }

  // ⚡ FAST MESSAGE SPAM (5 messages in 5 seconds)

  const id = member.id;

  if(!messageTracker.has(id)) messageTracker.set(id,[]);

  const data = messageTracker.get(id);

  data.push(Date.now());

  const filtered = data.filter(t => Date.now() - t < 5000);

  messageTracker.set(id,filtered);

  if(filtered.length > 5){

    await message.delete().catch(()=>{});

    return timeoutUser(member,"Fast Message Spam");

  }

});

// 🤖 Anti Bot Add
client.on("guildMemberAdd", async member=>{

  if(!member.user.bot) return;

  const logs = await member.guild.fetchAuditLogs({
    type:AuditLogEvent.BotAdd,
    limit:1
  });

  const entry = logs.entries.first();
  if(!entry) return;

  const executor = await member.guild.members.fetch(entry.executor.id);

  if(isProtected(executor)) return;

  if(member.kickable){
    await member.kick("Unauthorized Bot");
  }

  await timeoutUser(executor,"Unauthorized Bot Added");

  sendLog(member.guild,
    `🤖 Unauthorized Bot Added\n👤 User: ${executor.user.tag}\n🤖 Bot Removed: ${member.user.tag}`
  );

});

// 📁 Channel Protection
async function handleChannel(channel,type){

  const logs = await channel.guild.fetchAuditLogs({
    type: type==="create"
      ? AuditLogEvent.ChannelCreate
      : AuditLogEvent.ChannelDelete,
    limit:1
  });

  const entry = logs.entries.first();
  if(!entry) return;

  const executor = await channel.guild.members.fetch(entry.executor.id);

  if(isProtected(executor)) return;

  if(!channelTracker.has(executor.id))
    channelTracker.set(executor.id,[]);

  const actions = channelTracker.get(executor.id);

  actions.push(Date.now());

  const filtered = actions.filter(t => Date.now() - t < 5000);

  channelTracker.set(executor.id,filtered);

  if(filtered.length > 3){

    await timeoutUser(executor,"Channel Abuse");

    channelTracker.delete(executor.id);

  }

}

client.on("channelCreate",c=>handleChannel(c,"create"));
client.on("channelDelete",c=>handleChannel(c,"delete"));

client.login(process.env.TOKEN);
