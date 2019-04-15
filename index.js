require("dotenv").config();

const { BOT_TOKEN, BASE_URL, DEV } = process.env;

const Discord = require("discord.js");
const fetch = require("node-fetch");

const client = new Discord.Client();

const choices = {};

client.on("ready", () => {
	console.log("Bot ready");
})

client.on("message", async message => {
	if(DEV){
		if(!message.content.startsWith("!!"))
			return;
		message.content = message.content.slice(1);
	}
	if(!message.content.startsWith("!card"))
		return;
	let filterString = message.content.slice(6).toLowerCase();
	if(+filterString && choices[message.channel.id])
		filterString = (choices[message.channel.id][+filterString-1] || { name: "!!!!!!!!!!!!!!" }).name.toLowerCase();
	console.log(filterString);
	const cards = await (await fetch(`${BASE_URL}api/card/.json`)).json();
	let matched = cards.filter(c => c.name.toLowerCase().includes(filterString));
console.log(matched.length);
	if(matched.length === 1)
		return message.channel.send({ files: matched.map(c => `${BASE_URL}images/${c._id}.jpg`) });
	if(matched.length === 0)
		return message.channel.send("No card found.");
	message.channel.send("```\n" + matched.map((c, i) =>
		(i+1).toString().padStart((matched.length+1).toString().length, " ") + ": " + 
		c.factionName.slice(0,1) +
		" "  + c.cost +
		c.typeName.slice(0,1) + " "
		+ c.name
	).join("\n") + "\n```");
	choices[message.channel.id] = matched;
});

client.login(BOT_TOKEN);
