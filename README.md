# GameServerStatusDiscordBot

An open-source Discord bot that monitors game servers

## Installation

### Option 1: Use the public bot instance

Click this link to add the bot to your Discord server: https://discord.com/api/oauth2/authorize?client_id=875818249726595103&permissions=8&scope=bot

The public bot currently uses Administrator permissions, but I'm working on making it more secure.

### Option 2: Run the bot yourself!

I'd recommend using the Dockerfile included with this repo, but you can just use NPM to run the bot yourself. Check the .env file for the environment variables you need to set.

## Usage

### Command Reference

| Command                       | Description                                   | Example                                  |
| :---------------------------- | :-------------------------------------------- | :--------------------------------------- |
| `!query-raw <type> <host>`    | Returns a one-time raw JSON (1500 characters) | `!query-raw minecraft mc.hypixel.net`    |
| `!query-pretty <type> <host>` | Returns a one-time embed                      | `!query-pretty minecraft mc.hypixel.net` |
| `!monitor <type> <host>`      | Returns a monitor embed                       | `!monitor minecraft mc.hypixel.net`      |

## Development

This is an open-source project! Just use the [issue tracker](https://github.com/zuedev/GameServerStatusDiscordBot/issues) on GitHub to report bugs or suggest improvements. Feel free to fork and send pull requests, too! 😎

### TODO

- [x] Basic bot functionality (using message content commands)
- [ ] Stop using Administrator permissions for the public bot
- [ ] Implement slash commands
- [ ] Only use intents/partials we need
- [ ] Remove database dependency
- [ ] Make embeds more pretty
- [ ] Add more to the gameData.js file
- [ ] Auto-generate gameData.js/iconURL from url
- [ ] Retrieve missing server data from raw response if present (like Minecraft's "ping" is in `raw.vanilla.ping`)
- [ ] Web dashboard?
- [ ] Allow configuration!
- [ ] Allow force-update monitors via reaction-collection
- [ ] Command permissions
- [ ] Prettify the code a bit
