const { Client, GatewayIntentBits, AuditLogEvent, PermissionsBitField } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ✅ OWNER IDs
const OWNERS = [
"1405447087423885312",
"1233006477959102580",
"938513493487931392"
];

// ✅ LOG CHANNEL IDs
const LOG_CHANNEL_IDS = [
"1477921118693097553",
"1456662786577928286",
"1466746074772406418"
];

// ❌ Bad words list
const badWords = [
"gomma","punda","thevudiya","sunni","gotha",
"fuck","suthu","ass","fucker","umbu","motherfucker","sucker"
];

const messageTracker = new Map();
const channelTracker = new Map();

client.once("ready", () => {
  console.log(`🔥 Security Bot Online as ${client.user.tag}`);
});


// ✅ Protected users
function isProtected(member){

  if(OWNERS.includes(member.id)) return true;

  if(
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  ) return true;

  return false;

}


// ✅ Send logs
function sendLog(guild,msg){

  LOG_CHANNEL_IDS.forEach(id => {

    const channel = guild.channels.cache.get(id);

    if(channel) channel.send(msg);

  });

}


// ⏳ Timeout Function (10 minutes)
async function timeoutUser(member,reason,message){

  if(!member.moderatable) return;

  await member.timeout(10 * 60 * 1000,reason);

  const warn = await message.channel.send(
  `⚠️ ${member} broke rule: **${reason}**\n⏳ Timeout: **10 minutes**`
  );

  setTimeout(()=>warn.delete().catch(()=>{}),5000);

  sendLog(
    member.guild,
    `⏳ TIMEOUT\nUser: ${member.user.tag}\nReason: ${reason}`
  );

}


// 🔨 Ban Function
async function banUser(member,reason){

  if(!member.bannable) return;

  await member.ban({reason});

  sendLog(
    member.guild,
    `🔨 BANNED\nUser: ${member.user.tag}\nReason: ${reason}`
  );

}



// 📩 Message Protection
client.on("messageCreate", async message => {

  if(!message.guild || message.author.bot) return;

  const member = message.member;

  if(isProtected(member)) return;

  const text = message.content.toLowerCase();



  // 🔗 Link Rule
  if(text.includes("http://") || text.includes("https://") || text.includes("www.")){

    await message.delete().catch(()=>{});

    return timeoutUser(member,"Sending Links",message);

  }



  // 🤬 Bad Words Rule
  if(badWords.some(word => text.includes(word))){

    await message.delete().catch(()=>{});

    const warn = await message.channel.send(
    `⚠️ ${member} used **bad language**. Message deleted.`
    );

    setTimeout(()=>warn.delete().catch(()=>{}),5000);

    return;

  }



  // 📢 Same message spam rule
  const id = member.id;

  if(!messageTracker.has(id)) messageTracker.set(id,[]);

  const data = messageTracker.get(id);

  data.push({
    content:message.content,
    time:Date.now()
  });

  const filtered = data.filter(m => Date.now() - m.time < 5000);

  messageTracker.set(id,filtered);

  const same = filtered.filter(m => m.content === message.content);

  if(same.length > 4){

    await message.delete().catch(()=>{});

    return timeoutUser(member,"Message Spam",message);

  }

});



// 🤖 Anti Bot Add
client.on("guildMemberAdd", async member => {

  if(!member.user.bot) return;

  const logs = await member.guild.fetchAuditLogs({
    type:AuditLogEvent.BotAdd,
    limit:1
  });

  const entry = logs.entries.first();

  if(!entry) return;

  const executor = await member.guild.members.fetch(entry.executor.id);

  if(isProtected(executor)) return;

  await executor.ban({reason:"Unauthorized Bot Addition"});

  if(member.kickable){

    await member.kick("Unauthorized Bot");

  }

  sendLog(
    member.guild,
    `🚨 BOT ADD VIOLATION\n👤 Banned: ${executor.user.tag}\n🤖 Removed Bot: ${member.user.tag}`
  );

});



// 📁 Channel Spam Protection
async function handleChannel(channel,type){

  const logs = await channel.guild.fetchAuditLogs({
    type: type === "create"
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

  const filtered = actions.filter(t => Date.now() - t < 5000);

  channelTracker.set(executor.id,filtered);

  if(filtered.length > 3){

    await executor.ban({reason:"Channel Spam / Abuse"});

    sendLog(
      channel.guild,
      `📁 CHANNEL ABUSE\nUser: ${executor.user.tag} banned`
    );

    channelTracker.delete(executor.id);

  }

}

client.on("channelCreate",c => handleChannel(c,"create"));
client.on("channelDelete",c => handleChannel(c,"delete"));

client.login(process.env.TOKEN);
