
let colors = {
	good: 0xddbb22,
	sage: 0x6666ff,
	evil: 0xdd3333,
	wild: 0x22aa22,
};

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

require("dotenv").config();

const {
	TWITCH_ID,
	BOT_TOKEN,
	GUILD_ID,
	STREAMS_ID,
	DECKLIST_ID,
	CARDBOT_ID,
	PRECARDBOT_ID,
	PRERELEASE_ID,
	SINK_ID,
	BASE_URL,
	DEV,
	RULES_URL_RAW,
	RULES_URL_BLOB,
	RULINGS_URL_RAW,
	RULINGS_URL_BLOB,
} = process.env;

const Discord = require("discord.js");
const fetch = require("node-fetch");
const escapeRegexp = require("escape-string-regexp");
const fs = require("fs-extra");
const express = require("express");
const bodyParser = require("body-parser");

const client = new Discord.Client();

let alpha = "abcdefghijklmnopqrstuvwxyz".split("");
let letterInd = 0;
let letterIndPre = 0;
let cards = (async () => {
	cards = await (await fetch(`${BASE_URL}api/card/public.json`)).json();
})();
let rulingsText;
let rulesText = (async () => {
	[rulesText, rulingsText] = await Promise.all([
		fetch(RULES_URL_RAW).then(r => r.text()),
		fetch(RULINGS_URL_RAW).then(r => r.text()),
	]);
})();

const choices = {};
const choicesPre = {};

const channelLinkRegex = /^(.*)<#(\d+)>$/;

client.on("ready", () => {
	console.log("Bot ready");
	pingTwitch(true);
	setInterval(() => pingTwitch(), 10000);
})

client.on("message", async message => {
	if (message.author.bot) return;
	message.content = message.content.replace(/[’‘`]/g, "'");
	if (DEV && message.content.startsWith("!"))
		message.content = message.content.slice(1);
	else if (DEV)
		return;
	if (/.*(\[\[.*\]\]|\{\{.*\}\}|\(\(.*\)\)).*/.test(message.content)) {
		(message.content.match(/\[\[.*?\]\]|\(\([^\d].*?\)\)/g) || []).map(m =>
			cardbot(message, "!card " + m.slice(2, -2), message.author, message.channel)
		);
		(message.content.match(/\{\{.*?\}\}|\(\(\d.*?\)\)/g) || []).map(m =>
			parseRules(message, message.channel, m.slice(2, -2))
		);
	}
	if (message.content.includes("*") || message.mentions.users.keyArray().length)
		return;
	let { author, content, channel } = message;
	if (/^!(help|commands)$/i.test(content))
		return channel.send(
			(await fs.readFile(__dirname + "/help.md", "utf8"))
				.replace("#cardbot", `<#${CARDBOT_ID}>`)
				.replace("@epiepic", `<@${client.user.id}>`)
		);
	if (content.startsWith("!r60") || content.startsWith("!r56"))
		return rN(channel, author, +content.slice(2, 4), content.slice(5));
	if (content === "!cr")
		content = "!card random";
	if (content.startsWith("!r "))
		return parseRules(message, channel, content.slice(3));
	if (content.startsWith("!c "))
		content = "!card " + content.slice(3);
	if (!content.startsWith("!card")) {
		console.log(channel.id, PRECARDBOT_ID)
		if (channel.id === CARDBOT_ID || channel.id === PRECARDBOT_ID)
			content = "!card " + content;
		else return;
	}
	if ((channel.id === CARDBOT_ID || channel.id === PRECARDBOT_ID) && channelLinkRegex.test(content)) {
		let [_, _content, channelId] = channelLinkRegex.exec(content);
		content = _content;
		let newChannel = channel.guild.channels.get(channelId);
		if (channel.id !== PRECARDBOT_ID || newChannel.id === PRERELEASE_ID)
			channel = newChannel;
		else
			message.react(emoji("plucker"));
	}
	cardbot(message, content, author, channel);
});

async function cardbot(message, content, author, channel) {
	await cards;

	let isPre = channel.id === PRERELEASE_ID || channel.id === PRECARDBOT_ID;

	let filterString = content.slice(6).toLowerCase().trim();

	if (message.channel.id === CARDBOT_ID || message.channel.id === PRECARDBOT_ID) {
		let cs = message.channel.id === PRECARDBOT_ID ? choicesPre : choices
		if (cs[filterString.slice(0, 1)] && +filterString.slice(1)) {
			let { channel: _channel, user, cards, filterString: str, open } = choice = cs[filterString.slice(0, 1)];
			let card = cards[filterString.slice(1) - 1];
			postImage(card, user.id === author.id && open && channel === message.channel ? _channel : channel, author, str, isPre);
			choice.open = false;
			return;
		}
	}

	let filterRegex = new RegExp(
		"^" + filterString
			.split("")
			.map(escapeRegexp)
			.map(c => "(.*\\b(?<!')|)" + c)
			.join("")
		, "i");
	let matched = cards.filter(c =>
		(c.released || isPre) &&
		(
			filterRegex.test(c.name) ||
			(filterString.length >= 4 && c.traits && c.traits.toLowerCase().includes(filterString)) ||
			false
		)
	).sort((a, b) => a.name > b.name ? 1 : -1);

	if (filterString === "random")
		matched = [cards[Math.floor(Math.random() * cards.length)]];

	if (matched.length === 1)
		return postImage(matched[0], channel, author, filterString, isPre);
	if (matched.length)
		return postList(matched, channel, author, filterString, isPre);

	message.react(emoji("nogold"));
}

async function parseRules(message, channel, filterString) {
	await rulesText;

	if (/^\d.\d+.\d+[a-z]?$/.test(filterString)) {
		let line = rulesText.split("\n").find(l => l.startsWith(filterString));
		if (line)
			return channel.send("```" + line + "```");
		return message.react(emoji("nogold"));
	}

	findSection = t => t.split("\n").find(l => l.startsWith("#") && l.toLowerCase().includes(filterString.toLowerCase()));

	let section = findSection(rulesText);
	let url = RULES_URL_BLOB;

	if (!section)
		[section, url] = [findSection(rulingsText), RULINGS_URL_BLOB];

	if (!section)
		return message.react(emoji("nogold"));

	let hash = "#" + section.split(" ").slice(1).join(" ").toLowerCase().replace(/ /g, "-").replace(/[^\w\-]/g, "");
	url += hash;

	channel.send({ embed: { url, title: section.replace(/^#+ /, "") } });
}

async function rN(channel, user, n, setFilter) {
	setFilter = setFilter.replace("core", "set1").toLowerCase().trim().split(/\s+/g);
	let N = n;
	let fs = [13, 13, 13, 13];
	while (n > 52) {
		let i = Math.floor(Math.random() * 4);
		if (fs[i] === 17)
			continue;
		n--;
		fs[i]++;
	}
	let factions = "GOOD SAGE EVIL WILD".split(" ").map(f => cards.filter(c =>
		c.faction === f &&
		c.packCode !== "tokens" &&
		(!setFilter.join("") ? c.packCode !== "promos" && c.released : ~setFilter.indexOf(c.packCode))
	));
	let deck = [];
	fs.map((m, i) => {
		for (; m; m--)
			deck.push(factions[i].splice(Math.floor(Math.random() * factions[i].length), 1)[0]);
	})
	let x = Buffer.from(JSON.stringify(deck.map(c => ({ c: 1, n: c.cardCode }))), "utf8").toString("base64");
	let link = await shortlink(`${BASE_URL}?x=${x}&r60`);
	channel.send(`${user} R${N}: ${link}`);
	let dm = await user.createDM();
	dm.send(`R${N}: ${link}`);
}

function emoji(name) {
	return client.guilds.find(() => true).emojis.find(e => e.name === name);
}

function cardStat(c, e) {
	return `${
		e ? emoji(c.faction.toLowerCase()) : c.faction.slice(0, 1)
		} ${
		e ? emoji(c.cost ? "gold" : "nogold") : c.cost
		} ${
		c.type[0] === "C" ? `${c.offense.toString().padStart(2, " ")}/${c.defense.toString().padEnd(2, " ")}` : "  -  "
		} ${
		c.name
		}${
		c.packCode === "promos" ? " (promo)" : ""
		}`;
}

async function postImage(card, channel, user, filterString, isPre) {
	let { guild } = channel;
	let member = await guild.fetchMember(user, false);
	let nick = member.nickname || user.username;
	let cardbotChannel = guild.channels.get(isPre ? PRECARDBOT_ID : CARDBOT_ID);
	let sinkChannel = guild.channels.get(SINK_ID);
	let imageUrl = `${BASE_URL}images/${card._id}.jpg`;
	let message;
	try {
		message = await sinkChannel.send({ files: [imageUrl] });
		imageUrl = [...message.attachments.values()][0].url;
	} catch (e) {
		imageUrl = null
	}
	let formatTextVar = t => t
		.replace(/\n(.)/g, " $1")
		.replace(/\n\n/g, "\n")
		.replace(/\[(.+?)\]/g, "**$1**")
		.replace(/<\/?i>/gi, "*")
	let embed = {
		color: colors[card.faction.toLowerCase()],
		thumbnail: { url: imageUrl },
		title: cardStat(card, true),
		url: imageUrl,
		description: formatTextVar(card.textVar),
		fields: card.discardVar ? [{
			name: "Discard:",
			value: formatTextVar(card.discardVar),
		}] : [],
		footer: {
			text: `re ${nick} '${filterString}'`,
		},
	};
	cardbotChannel.send(channel.id === cardbotChannel.id ? "" : channel + "", { embed });
	if (channel.id !== cardbotChannel.id)
		channel.send({ embed });
}

function postList(cards, channel, user, filterString, isPre) {
	let { guild } = channel;
	let cardbotChannel = guild.channels.get(isPre ? PRECARDBOT_ID : CARDBOT_ID);
	let letter = alpha[(isPre ? letterIndPre++ : letterInd++) % alpha.length];
	cardbotChannel.send(`<@${user.id}> Which?\n\`\`\`${
		cards.map((c, i) =>
			(letter + (i + 1)).padStart(cards.length.toString().length + 1, " ") + ": " + cardStat(c)
		).join("\n")
		}\n\`\`\``);
	(isPre ? choicesPre : choices)[letter] = {
		channel,
		user,
		cards,
		open: true,
		filterString,
	};
}

async function shortlink(url) {
	return (await fetch(`${BASE_URL}api/link/new/`, {
		method: "POST",
		body: JSON.stringify({ url }),
		headers: { "Content-Type": "application/json" },
	}).then(r => r.json())).url;
}

client.login(BOT_TOKEN);

const app = express();

let lastIds = [];

async function pingTwitch(noSend) {
	let t = {
		headers: { "Client-ID": TWITCH_ID },
	};
	let response = await fetch(`https://api.twitch.tv/helix/streams?game_id=496145&first=100`, t).then(r => r.json());
	let { data: cur } = response;
	console.log(response);
	console.log(lastIds, cur, noSend, Math.random());
	let oldLastIds = lastIds;
	lastIds = cur.map(c => c.id);
	cur = cur.filter(c => !~oldLastIds.indexOf(c.id));
	console.log(cur);
	if (noSend) return;
	let guild = client.guilds.get(GUILD_ID);
	let channel = guild.channels.get(STREAMS_ID);
	cur.map(async c => {
		let user = (await fetch(`https://api.twitch.tv/helix/users?id=${c.user_id}`, t).then(r => r.json())).data[0];
		channel.send(user.display_name + " is now streaming live on Twitch!", {
			embed: {
				color: 0x6441a5,
				author: {
					icon_url: user.profile_image_url,
					name: user.display_name,
				},
				title: c.title,
				url: `https://twitch.tv/${user.display_name}`,
				timestamp: c.started_at,
			}
		})
	});
}

app.post("/newDeck", bodyParser.text(), async (req, res) => {
	res.status(204).end();

	const id = req.body;
	let [{ title, poster: { discordId: posterId } }, url] = await Promise.all([
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
