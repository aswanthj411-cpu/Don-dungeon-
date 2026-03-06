const { Client, GatewayIntentBits, AuditLogEvent, PermissionsBitField } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});


// OWNER IDS
const OWNERS = [
"1405447087423885312",
"1233006477959102580",
"938513493487931392"
];


// SERVER LOG CHANNELS (ServerID : ChannelID)
const SERVER_LOG_CHANNELS = {

"1273613883793477642":"1477921118693097553",
"1453227644572270726":"1466746074772406418"

};


// BAD WORD LIST
const badWords = [
"gomma","punda","thevudiya","sunni","gotha",
"fuck","suthu","ass","fucker","umbu","motherfucker","sucker"
];


const messageTracker = new Map();
const spamTracker = new Map();
const channelTracker = new Map();


client.once("ready", () => {
  console.log(`🔥 Security Bot Online as ${client.user.tag}`);
});


// Protected users
function isProtected(member){

  if(OWNERS.includes(member.id)) return true;

  if(
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  ) return true;

  return false;

}


// Send log to correct server channel
function sendLog(guild,msg){

  const channelId = SERVER_LOG_CHANNELS[guild.id];

  if(!channelId) return;

  const channel = guild.channels.cache.get(channelId);

  if(channel) channel.send(msg);

}


// Timeout function
async function timeoutUser(member,reason,message){

  if(!member.moderatable) return;

  await member.timeout(10 * 60 * 1000,reason);

  if(message){
    message.channel.send(
      `⚠️ <@${member.id}> broke rule: **${reason}**\n⏳ Timeout: 10 minutes`
    ).catch(()=>{});
  }

  sendLog(
    member.guild,
    `⏳ TIMEOUT\nUser: ${member.user.tag}\nReason: ${reason}`
  );

}


// BAN function
async function banUser(member,reason){

  if(!member.bannable) return;

  await member.ban({reason});

  sendLog(
    member.guild,
    `🔨 BANNED\nUser: ${member.user.tag}\nReason: ${reason}`
  );

}


// MESSAGE PROTECTION
client.on("messageCreate",async(message)=>{

  if(!message.guild || message.author.bot) return;

  const member = message.member;

  if(isProtected(member)) return;

  const text = message.content.toLowerCase();


  // LINK PROTECTION
  if(
    text.includes("http://") ||
    text.includes("https://") ||
    text.includes("www.")
  ){

    await message.delete().catch(()=>{});

    return timeoutUser(member,"Sending Links",message);

  }


  // BAD WORD FILTER
  if(badWords.some(word=>text.includes(word))){

    await message.delete().catch(()=>{});

    message.channel.send(
      `🚫 <@${member.id}> bad language is not allowed`
    ).catch(()=>{});

    sendLog(
      member.guild,
      `🚫 BAD WORD\nUser: ${member.user.tag}\nMessage deleted`
    );

    return;

  }


  // FAST MESSAGE SPAM
  const userId = member.id;

  if(!spamTracker.has(userId)) spamTracker.set(userId,[]);

  const spamData = spamTracker.get(userId);

  spamData.push(Date.now());

  const spamFiltered = spamData.filter(t=>Date.now()-t < 3000);

  spamTracker.set(userId,spamFiltered);

  if(spamFiltered.length > 5){

    await message.delete().catch(()=>{});

    return timeoutUser(member,"Fast Message Spam",message);

  }


  // SAME MESSAGE SPAM
  if(!messageTracker.has(userId)) messageTracker.set(userId,[]);

  const data = messageTracker.get(userId);

  data.push({
    content:message.content,
    time:Date.now()
  });

  const filtered = data.filter(m=>Date.now()-m.time < 5000);

  messageTracker.set(userId,filtered);

  const same = filtered.filter(m=>m.content === message.content);

  if(same.length > 4){

    await message.delete().catch(()=>{});

    return timeoutUser(member,"Repeated Message Spam",message);

  }

});


// ANTI BOT ADD
client.on("guildMemberAdd",async(member)=>{

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

  await executor.timeout(10*60*1000,"Added unauthorized bot");

  sendLog(
    member.guild,
    `🤖 Unauthorized Bot Added\nExecutor: ${executor.user.tag}\nBot Removed: ${member.user.tag}`
  );

});


// CHANNEL ABUSE
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

  const filtered = actions.filter(t=>Date.now()-t < 5000);

  channelTracker.set(executor.id,filtered);

  if(filtered.length > 3){

    await banUser(executor,"Channel Abuse");

    channelTracker.delete(executor.id);

  }

}


client.on("channelCreate",channel=>handleChannel(channel,"create"));
client.on("channelDelete",channel=>handleChannel(channel,"delete"));


client.login(process.env.TOKEN);
