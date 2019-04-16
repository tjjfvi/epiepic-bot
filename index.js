
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

require("dotenv").config();

const { BOT_TOKEN, DECKLIST_ID, CARDBOT_ID, BASE_URL, DEV, RULES_URL_RAW, RULES_URL_BLOB } = process.env;

const Discord = require("discord.js");
const fetch = require("node-fetch");
const escapeRegexp = require("escape-string-regexp");
const fs = require("fs-extra");
const express = require("express");
const bodyParser = require("body-parser");

const client = new Discord.Client();

let alpha = "abcdefghijklmnopqrstuvwxyz".split("");
let letterInd = 0;
let cards = (async () => {
	cards = await (await fetch(`${BASE_URL}api/card/.json`)).json();
})();
let rulesText = (async () => {
	rulesText = await fetch(RULES_URL_RAW).then(r => r.text());
})();

const choices = {};

const channelLinkRegex = /^(.*)<#(\d+)>$/;

client.on("ready", () => {
	console.log("Bot ready");
})

client.on("message", async message => {
	if(message.content.includes("*") || message.mentions.users.keyArray().length)
		return;
	let { author, content, channel } = message;
	if(author.id === client.user.id)
		return;
	if(DEV && content.startsWith("!"))
		content = content.slice(1);
	if(content.startsWith("!commands") || content.startsWith("!help"))
		return channel.send(
			(await fs.readFile(__dirname + "/help.md", "utf8"))
				.replace("#cardbot", `<#${CARDBOT_ID}>`)
				.replace("@epiepic", `<@${client.user.id}>`)
		);
	if(content.startsWith("!r60") || content.startsWith("!r56"))
		return rN(channel, author, +content.slice(2,4));
	if(content.startsWith("!r "))
		return parseRules(channel, content.slice(3));
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

	let filterString = content.slice(6).toLowerCase().trim();

	if(message.channel.id === CARDBOT_ID && choices[filterString.slice(0,1)] && +filterString.slice(1)) {
		let { channel: _channel, user, cards, open } = choice = choices[filterString.slice(0,1)];
		let card = cards[filterString.slice(1)-1];
		postImage(card, user.id === author.id && open && channel === message.channel ? _channel : channel, author);
		choice.open = false;
		return;
	}
	
	let filterRegex = new RegExp(
		"^" + filterString
			.split("")
			.map(escapeRegexp)
			.map(c => "(.*\\b(?<!')|)" + c)
		.join("")
	, "i");
	let matched = cards.filter(c =>
		filterRegex.test(c.name) ||
		(filterString.length >= 4 && c.traits && c.traits.toLowerCase().includes(filterString)) ||
		false
	).sort((a, b) => a.name > b.name ? 1 : -1);

	if(matched.length === 1)
		return postImage(matched[0], channel, author);
	if (matched.length)
		return postList(matched, channel, author);
	message.channel.send("No card found.");
});

async function parseRules(channel, filterString){
	await rulesText;
	
	if(/^\d.\d+.\d+[a-z]?$/.test(filterString)){
		let line = rulesText.split("\n").find(l => l.startsWith(filterString));
		if(line)
			return channel.send("```"+line+"```");
		return channel.send(`Line ${filterString} not found.`);
	}

	let section = rulesText.split("\n").find(l => l.startsWith("#") && l.toLowerCase().includes(filterString.toLowerCase()));
	
	if(!section)
		return channel.send(`Section ${filterString} not found.`);

	console.log(section.split(/ /)[1]);
	let hash = "#" + section.split(" ").slice(1).join(" ").toLowerCase().replace(" ", "-").replace(/[^\w\-]/g, "");
	let link = RULES_URL_BLOB + hash;

	channel.send({ embed: { url: link, title: section.replace(/^#+ /, "") } });
}

async function rN(channel, user, n){
	let N = n;
	let fs = [13,13,13,13];
	while(n > 52){
		let i = Math.floor(Math.random()*4);
		if(fs[i] === 17)
			continue;
		n--;
		fs[i]++;
	}
	let factions = "GOOD SAGE EVIL WILD".split(" ").map(f => cards.filter(c => c.faction === f && c.packCode !== "promos"));
	let deck = [];
	fs.map((m, i) => {
		for(;m;m--)
			deck.push(factions[i].splice(Math.floor(Math.random()*factions[i].length), 1)[0]);
	})
	let x = Buffer.from(JSON.stringify(deck.map(c => ({ c: 1, n: c.cardCode }))), "utf8").toString("base64");
	let link = await shortlink(`${BASE_URL}?x=${x}&r60`);
	channel.send(`${user} R${N}: ${link}`);
	let dm = await user.createDM();
	dm.send(`R${N}: ${link}`);
}

function cardStat(c){
	return `${c.faction.slice(0,1)} ${c.cost}${c.type.slice(0,1)} ${c.name}` + (c.packCode === "promos" ? " (promo)" : "");
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

async function shortlink(url){
	return (await fetch(`${BASE_URL}api/link/new/`, {
		method: "POST",
		body: JSON.stringify({ url }),
		headers: { "Content-Type": "application/json" },
	}).then(r => r.json())).url;
}

client.login(BOT_TOKEN);

const app = express();

app.post("/newDeck", bodyParser.text(), async (req, res) => {
	res.status(204).end();

	const id = req.body;
	let [{ title, poster: { discordId: posterId } }, { url }] = await Promise.all([
		fetch(`${BASE_URL}api/deck:${id}/`).then(r => r.json()).then(async d => ({
			...d,
			poster: (await (await fetch(`${BASE_URL}api/user:${d.poster}`)).json()),
		})),
		shortlink(`${BASE_URL}deck?id=${id}`),
	]);

	const channel = client.guilds.array()[0].channels.get(DECKLIST_ID);
	channel.send(`A new deck was posted by <@${posterId}>: *${title}* – ${url}`);
});

app.listen(process.env.PORT || 15149);
