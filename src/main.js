import {
  Client as DiscordClient,
  Intents as DiscordIntents,
  MessageEmbed as DiscordMessageEmbed,
} from "discord.js";
import Gamedig from "gamedig";
import GameData from "./gameData.js";
import Mongo from "mongodb";

const client = new DiscordClient({
  intents: new DiscordIntents(["GUILDS", "GUILD_MESSAGES"]),
});

const mongocluster = await Mongo.MongoClient.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

client.login(process.env.DISCORD_TOKEN);

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!! 🚀`);

  onWakeup();

  updatePresenceWithServerCount();

  setInterval(() => {
    updatePresenceWithServerCount();
    monitorQueueHandler();
  }, 2000);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith("!") && !message.content.startsWith("! ")) {
    if (message.guild === null)
      return message.reply("Commands don't work in DMs!");

    if (message.author.id !== message.guild.ownerId)
      return message.reply("You need to be the server owner!");

    const commandArray = message.content.substring(1).split(" ");
    const command = commandArray.shift();
    const args = commandArray;

    switch (command) {
      case "monitor":
        (async () => {
          let waitMessage = await message.channel.send({
              content: "_Setting up monitor..._",
            }),
            query = await queryGameServer(args[0], args[1]);

          if (query === "badgame")
            return waitMessage.edit(`Invalid game: ${args[0]}`);

          waitMessage.delete();

          let monitorMessage = await message.channel.send({
            embeds: [prettyQueryEmbedBuilder(query, args[0], args[1])],
          });

          await mongocluster
            .db(process.env.MONGO_DB)
            .collection("queue")
            .insertOne({
              type: "monitorUpdate",
              channelId: monitorMessage.channel.id,
              messageId: monitorMessage.id,
              arguments: {
                type: args[0],
                host: args[1],
              },
            });

          message.delete();
        })();
        break;
      case "query-raw":
        (async () => {
          let waitMessage = await message.reply({
              content: "_Querying..._",
            }),
            query = await queryGameServer(args[0], args[1]);

          if (query === "badgame")
            return waitMessage.edit(`Invalid game: ${args[0]}`);

          waitMessage.edit({
            content:
              "```json\n" +
              JSON.stringify(query, null, 2).substring(0, 1500) +
              "\n```",
          });
        })();
        break;
      case "query-pretty":
        (async () => {
          let waitMessage = await message.reply({
              content: "_Querying..._",
            }),
            query = await queryGameServer(args[0], args[1]);

          if (query === "badgame")
            return waitMessage.edit(`Invalid game: ${args[0]}`);

          waitMessage.edit({
            content: "**Query results:**",
            embeds: [prettyQueryEmbedBuilder(query, args[0], args[1])],
          });
        })();
        break;
      case "ping":
        message.react("🏓");
        message.reply("Pong!");
        break;
      default:
        message.react("❓");
        message.reply("Command not recognised.");
        break;
    }
  }
});

function onWakeup() {
  client.application.fetch().then((application) =>
    application.owner.send({
      embeds: [
        {
          title: "🌅 Wakeup Report",
          color: 0x33aaff,
          fields: [
            {
              name: "Initialisation time",
              value: `${client.uptime}ms`,
            },
            {
              name: "Guilds",
              value: client.guilds.cache.size.toString(),
            },
          ],
        },
      ],
    })
  );
}

function monitorQueueHandler() {
  mongocluster
    .db(process.env.MONGO_DB)
    .collection("queue")
    .find({ type: "monitorUpdate" })
    .toArray()
    .then((array) =>
      array.forEach((monitorTask) => {
        client.channels
          .fetch(monitorTask.channelId)
          .then((channel) =>
            channel.messages
              .fetch(monitorTask.messageId)
              .then(async (message) => {
                try {
                  let query = await queryGameServer(
                    monitorTask.arguments.type,
                    monitorTask.arguments.host
                  );

                  message.edit({
                    embeds: [
                      prettyQueryEmbedBuilder(
                        query,
                        monitorTask.arguments.type,
                        monitorTask.arguments.host
                      ),
                    ],
                  });
                } catch (error) {
                  deleteTaskByMessageId(monitorTask.messageId);
                }
              })
          )
          .catch((error) => {
            deleteTaskByMessageId(monitorTask.messageId);
          });
      })
    );
}

function updatePresenceWithServerCount() {
  client.user.setPresence({
    activities: [
      { type: "WATCHING", name: `over ${client.guilds.cache.size} servers.` },
    ],
  });
}

function deleteTaskByMessageId(messageId) {
  mongocluster.db(process.env.MONGO_DB).collection("queue").deleteOne({
    messageId: messageId,
  });
}

function prettyQueryEmbedBuilder(query, type, host) {
  let embed = new DiscordMessageEmbed();

  if (query) {
    embed.setTitle(host);
    embed.setDescription("Server is online! ✅");
    if (query.name) embed.addField("Server Name", query.name, true);
    if (typeof query.password !== undefined)
      embed.addField("Passworded", query.password ? "Yes" : "No", true);
    if (query.ping) embed.addField("Ping", query.ping.toString() + "ms", true);
    if (query.map) embed.addField("Map", query.map, true);
    if (query.connect)
      embed.addField("Connect", "`" + query.connect + "`", true);
    if (query.players) {
      if (query.players.length > 25) query.players.length = 25;

      embed.addField(
        `Players (${query.players.length}/${query.maxplayers || "?"})`,
        query.players.length > 0
          ? query.players.map((p) => p.name || "ConnectingPlayer").join(", ")
          : "No players"
      );
    }
  } else {
    embed.setTitle(host);
    embed.setDescription("Server is offline! ⛔");
  }

  if (Object.keys(GameData).includes(type)) {
    embed.setAuthor(
      GameData[type].name,
      GameData[type].iconURL,
      GameData[type].url
    );
    embed.setColor(GameData[type].color);
  }

  embed.setTimestamp();

  return embed;
}

async function queryGameServer(type, host) {
  let state = 0;

  try {
    state = await Gamedig.query({
      type: type,
      host: host,
    });
  } catch (error) {
    if (error.message.includes("Invalid game")) state = "badgame";
  }

  return state;
}
