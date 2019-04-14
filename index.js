require("dotenv").config();

const { BOT_TOKEN, BASE_URL } = process.env;

const Discord = require("discord.js");
const fetch = require("node-fetch");

const client = new Discord.Client();

client.on("ready", () => {
	console.log("Bot ready");
})

client.on("message", async message => {
	if(!message.content.startsWith("!card"))
		return;
	const filterString = message.content.slice(6).toLowerCase();
	const cards = await (await fetch(`${BASE_URL}api/card/.json`)).json();
	let matched = cards.filter(c => c.name.toLowerCase() === filterString);
	message.channel.send({ files: matched.map(c => `${BASE_URL}images/${c._id}.jpg`) });
});

client.login(BOT_TOKEN);
