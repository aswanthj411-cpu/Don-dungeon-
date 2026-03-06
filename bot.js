const { Client, GatewayIntentBits, AuditLogEvent, PermissionsBitField } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ✅ OWNER IDS
const OWNERS = [
"1405447087423885312",
"1233006477959102580",
"938513493487931392"
];

// ✅ LOG CHANNELS
const LOG_CHANNEL_IDS = [
"1479081747928059912",
"1466746074772406418",
"1456662786577928286",
"1276743719688601660"
];

// ❌ BAD WORDS
const badWords = [
"gomma","punda","thevudiya","sunni","gotha",
"fuck","suthu","ass","fucker","umbu"
];

const messageTracker = new Map();
const channelTracker = new Map();

client.once("ready", () => {
  console.log(`🔥 Security Bot Online as ${client.user.tag}`);
});

// ✅ PROTECTED USERS
function isProtected(member){
  if(OWNERS.includes(member.id)) return true;

  if(
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  ) return true;

  return false;
}

// 📢 SEND LOG
function sendLog(guild,msg){
  LOG_CHANNEL_IDS.forEach(id=>{
    const channel = guild.channels.cache.get(id);
    if(channel) channel.send(msg);
  });
}

// ⏳ TIMEOUT FUNCTION
async function timeoutUser(member,reason){

  if(!member.moderatable) return;

  await member.timeout(10 * 60 * 1000, reason);

  const warn = await member.guild.systemChannel?.send(
  `⚠ ${member} violated rule: **${reason}**\n⏳ Timeout: 10 minutes`);

  sendLog(
    member.guild,
    `⚠ RULE BREAK\nUser: ${member.user.tag}\nAction: 10min timeout\nReason: ${reason}`
  );

}

// 📩 MESSAGE PROTECTION
client.on("messageCreate", async message => {

  if(!message.guild || message.author.bot) return;

  const member = message.member;

  if(isProtected(member)) return;

  const text = message.content.toLowerCase();

  // 🔗 LINK RULE
  if(text.includes("http://") || text.includes("https://") || text.includes("www.")){

    await message.delete().catch(()=>{});

    return timeoutUser(member,"Sending Links");

  }

  // 🤬 BAD WORD RULE
  if(badWords.some(word=>text.includes(word))){

    await message.delete().catch(()=>{});

    message.channel.send(
    `⚠ ${member} bad language is not allowed.`);

    sendLog(
      message.guild,
      `🤬 BAD WORD\nUser: ${member.user.tag}\nMessage: ${message.content}`
    );

    return;

  }

  // 📢 SPAM RULE
  const id = member.id;

  if(!messageTracker.has(id))
  messageTracker.set(id,[]);

  const data = messageTracker.get(id);

  data.push({
    content: message.content,
    time: Date.now()
  });

  const filtered = data.filter(m=>Date.now()-m.time<5000);

  messageTracker.set(id,filtered);

  const same = filtered.filter(m=>m.content===message.content);

  if(same.length > 4){

    await message.delete().catch(()=>{});

    return timeoutUser(member,"Message Spam");

  }

});

// 🤖 BOT ADD RULE
client.on("guildMemberAdd", async member => {

  if(!member.user.bot) return;

  const logs = await member.guild.fetchAuditLogs({
    type: AuditLogEvent.BotAdd,
    limit: 1
  });

  const entry = logs.entries.first();
  if(!entry) return;

  const executor = await member.guild.members.fetch(entry.executor.id);

  if(isProtected(executor)) return;

  // ⏳ timeout user
  if(executor.moderatable){
    await executor.timeout(10*60*1000,"Unauthorized Bot Addition");
  }

  // ❌ kick bot
  if(member.kickable){
    await member.kick("Unauthorized Bot Added");
  }

  member.guild.systemChannel?.send(
  `🚨 ${executor} tried to add a bot\n⏳ Timeout: 10 minutes\n🤖 Bot removed`);

  sendLog(
    member.guild,
    `🤖 BOT ADD VIOLATION\nUser: ${executor.user.tag}\nAction: timeout 10min\nBot Removed: ${member.user.tag}`
  );

});

// 📁 CHANNEL PROTECTION
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

  if(!channelTracker.has(executor.id)){
    channelTracker.set(executor.id,[]);
  }

  const actions = channelTracker.get(executor.id);

  actions.push(Date.now());

  const filtered = actions.filter(t=>Date.now()-t<5000);

  channelTracker.set(executor.id,filtered);

  if(filtered.length>3){

    await executor.ban({reason:"Channel Abuse"});

    channel.guild.systemChannel?.send(
    `🚨 ${executor.user.tag} banned for channel abuse`);

    sendLog(
      channel.guild,
      `📁 CHANNEL ABUSE\nUser: ${executor.user.tag}\nAction: BAN`
    );

    channelTracker.delete(executor.id);

  }

}

client.on("channelCreate",channel=>handleChannel(channel,"create"));
client.on("channelDelete",channel=>handleChannel(channel,"delete"));

client.login(process.env.TOKEN);
