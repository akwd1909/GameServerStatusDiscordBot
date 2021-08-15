import {
  Client as DiscordClient,
  Intents as DiscordIntents,
  MessageEmbed as DiscordMessageEmbed,
} from "discord.js";
import Gamedig from "gamedig";
import Mongo from "mongodb";
import GameData from "./gameData.js";
import Config from "./config.js";

const client = new DiscordClient({
  intents: new DiscordIntents(["GUILDS", "GUILD_MESSAGES"]),
});

// eslint doesn't like this but it's a supported use case: https://v8.dev/features/top-level-await#resource-initialization
const mongocluster = await Mongo.MongoClient.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}, initialising...`);

  // wait for the meat to rest before serving
  await (async () => {
    updatePresenceWithServerCount();

    setInterval(() => {
      updatePresenceWithServerCount();
      monitorQueueHandler();
    }, Config.monitorPollingInterval);
  })();

  if (!Config.suppressWakeup) sendWakeupReport();

  console.log("We have liftoff!! 🚀");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (
    message.content.startsWith(Config.prefix) &&
    !message.content.startsWith(Config.prefix + " ") // we no like leading spaces
  ) {
    if (message.guild === null)
      return message.reply("Commands don't work in DMs!");

    if (message.author.id !== message.guild.ownerId)
      return message.reply("You need to be the server owner!");

    const commandArray = message.content.substring(1).split(" ");
    const command = commandArray.shift();
    const args = commandArray;

    switch (command) {
      case "monitor":
        doMonitorCommand(message, ...args);
        break;
      case "query-raw":
        doQueryRawCommand(message, ...args);
        break;
      case "query-pretty":
        doQueryPrettyCommand(message, ...args);
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

client.login(process.env.DISCORD_TOKEN);

async function doMonitorCommand(message, type, host) {
  let monitorCount = await mongocluster
    .db(process.env.MONGO_DB)
    .collection("queue")
    .find({ type: "monitorUpdate", guildId: message.guild.id })
    .toArray();

  if (monitorCount.length >= Config.monitorLimit) {
    return message.reply(
      `You can only have ${Config.monitorLimit} monitors active! Delete one of them and try again.`
    );
  } else {
    message
      .reply({
        content: "_Setting up monitor..._",
      })
      .then(async (message) => {
        try {
          let query;

          try {
            query = await queryGameServer(type, host);
          } catch (error) {
            query = 0;
          }

          message
            .edit({
              content: ".",
              embeds: [prettyQueryEmbedBuilder(query, type, host)],
            })
            .then((message) => {
              mongocluster
                .db(process.env.MONGO_DB)
                .collection("queue")
                .insertOne({
                  type: "monitorUpdate",
                  guildId: message.guild.id,
                  channelId: message.channel.id,
                  messageId: message.id,
                  arguments: {
                    type: type,
                    host: host,
                  },
                });
            });
        } catch (error) {
          queryErrorHandler(message, error);
        }
      })
      .catch(caughtErrorHandler);
  }
}

function doQueryRawCommand(message, type, host) {
  message
    .reply({
      content: "_Querying..._",
    })
    .then(async (message) => {
      try {
        message.edit({
          content:
            "```json\n" +
            JSON.stringify(
              await queryGameServer(type, host),
              null,
              2
            ).substring(0, 1500) +
            "\n```",
        });
      } catch (error) {
        queryErrorHandler(message, error);
      }
    })
    .catch(caughtErrorHandler);
}

function doQueryPrettyCommand(message, type, host) {
  message
    .reply({
      content: "_Querying..._",
    })
    .then(async (message) => {
      try {
        message.edit({
          content: "**Query results:**",
          embeds: [
            prettyQueryEmbedBuilder(
              await queryGameServer(type, host),
              type,
              host
            ),
          ],
        });
      } catch (error) {
        queryErrorHandler(message, error);
      }
    })
    .catch(caughtErrorHandler);
}

function queryErrorHandler(message, error) {
  if (error.message.includes("Invalid game"))
    return message.edit({
      content:
        "That's not a valid game server type! Please check the list of valid values here: https://github.com/gamedig/node-gamedig#games-list",
    });

  if (
    error.message.includes("Failed all") &&
    error.message.includes("attempts")
  )
    return message.edit({
      content:
        "Looks like the server is offline, the hostname is invalid, or the wrong game server protocol was selected!",
    });

  message
    .edit({
      content:
        "Something went wrong! 😰\nBut don't worry, I've sent an error report to my development team.",
    })
    .then(caughtErrorHandler(error));
}

function caughtErrorHandler(error) {
  console.error(error);

  if (!Config.suppressErrorReporting)
    client.application
      .fetch()
      .then((application) =>
        application.owner.send("I errored! 😰\n```json" + error + "\n```")
      );
}

function sendWakeupReport() {
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
                  let query;

                  try {
                    query = await queryGameServer(
                      monitorTask.arguments.type,
                      monitorTask.arguments.host
                    );
                  } catch (error) {
                    query = 0;
                  }

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
                  try {
                    deleteTaskByMessageId(monitorTask.messageId);
                  } catch (error) {}
                }
              })
          )
          .catch((error) => {
            try {
              deleteTaskByMessageId(monitorTask.messageId);
            } catch (error) {}
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
  return await Gamedig.query({
    type: type,
    host: host,
  });
}
