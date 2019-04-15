
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

require("dotenv").config();

const { BOT_TOKEN, CARDBOT_ID, BASE_URL, DEV } = process.env;

const Discord = require("discord.js");
const fetch = require("node-fetch");
const escapeRegexp = require("escape-string-regexp");

const client = new Discord.Client();

let alpha = "abcdefghijklmnopqrstuvwxyz".split("");
let letterInd = 0;
let cards = (async () => {
	cards = await (await fetch(`${BASE_URL}api/card/.json`)).json();
})();

const choices = {};

const channelLinkRegex = /^(.*)<#(\d+)>$/;

client.on("ready", () => {
	console.log("Bot ready");
})

client.on("message", async message => {
	let { author, content, channel } = message;
	if(author.id === client.user.id)
		return;
	if(DEV && content.startsWith("!"))
		content = content.slice(1);
	if(!content.startsWith("!card")){
		if(channel.id === CARDBOT_ID)
			content = "!card " + content;
		else return;
	}
	if(channel.id === CARDBOT_ID && channelLinkRegex.test(content)){
		let [_, _content, channelId] = channelLinkRegex.exec(content);
		content = _content;
		channel = channel.guild.channels.get(channelId);
	}
	await cards;

	let filterString = content.slice(6).toLowerCase();

	if(message.channel.id === CARDBOT_ID && choices[filterString.slice(0,1)] && +filterString.slice(1)) {
		let { channel: _channel, user, cards, open } = choice = choices[filterString.slice(0,1)];
		let card = cards[filterString.slice(1)-1];
		postImage(card, user.id === author.id && open && channel === message.channel ? _channel : channel, author);
		choice.open = false;
		return;
	}
	
	let filterRegex = new RegExp(
		"^" + filterString
			.trim()
			.split("")
			.map(escapeRegexp)
			.map(c => "(.*\\b(?<!')|)" + c)
		.join("")
	, "i");
	let matched = cards.filter(c => filterRegex.test(c.name));

	if(matched.length === 1)
		return postImage(matched[0], channel, author);
	if (matched.length)
		return postList(matched, channel, author);
	message.channel.send("No card found.");
});

function cardStat(c){
	return `${c.factionName.slice(0,1)} ${c.cost}${c.typeName.slice(0,1)} ${c.name}` + (c.packCode === "promos" ? " (promo)" : "");
}

async function postImage(card, channel, user){
	let { guild } = channel;
	let cardbotChannel = guild.channels.get(CARDBOT_ID);
	let imageUrl = `${BASE_URL}images/${card._id}.jpg`;
	let message = await cardbotChannel.send(`<#${channel.id}> <@${user.id}> \`${cardStat(card)}\``, { files: [imageUrl] });
	imageUrl = [...message.attachments.values()][0].url;
	let embed = new Discord.RichEmbed().setThumbnail(imageUrl);
	if(channel.id !== cardbotChannel.id)
		channel.send(`<@${user.id}> <#${cardbotChannel.id}> \`${cardStat(card)}\``, embed);
}

function postList(cards, channel, user){
	let { guild } = channel;
	let cardbotChannel = guild.channels.get(CARDBOT_ID);
	let letter = alpha[letterInd++ % alpha.length];
	cardbotChannel.send(`<@${user.id}> Which?\n\`\`\`\n${
		cards.map((c, i) =>
			(letter+(i+1)).padStart(cards.length.toString().length+1, " ") + ": " + cardStat(c)
		).join("\n")
	}\n\`\`\``);
	choices[letter] = {
		channel,
		user,
		cards,
		open: true,
	};
}

client.login(BOT_TOKEN);
