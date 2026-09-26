# null — Discord tickets, applications, vouches, and giveaways

Node.js 20.11+ bot for one Discord server. The bot's **display name** is set to `null` in the Discord Developer Portal; the code itself cannot rename the application. All records are stored in `data/state.json` by default. Keep that file on persistent storage and back it up.

## Features

- `/ticket open`: private channel for the member and staff. `/ticket close` locks the owner out of sending; staff can `/ticket reopen` or `/ticket delete`. Ticket owners and staff can `/ticket add` and `/ticket remove` other members.
- `/apply`: three-question application form. Staff receive Approve and Reject buttons in a private review channel; applicants receive a DM if permitted. A member can reapply after a decision.
- `/vouch user reason`: posts a public recommendation. Each member may vouch once per person, cannot vouch for themself or a bot, and the recipient must belong to the server. `/vouches user` shows the total and five recent reasons.
- `/panel type:tickets` or `/panel type:applications`: posts a reusable button panel in the current channel.
- `/giveaway start prize:... minutes:... winners:...`: staff post an entry button in the current channel. The giveaway ends automatically after 1–10,080 minutes and draws up to 10 unique winners. `/giveaway end message_id:...` draws early; `/giveaway reroll message_id:...` draws one additional winner, excluding prior winners. Members can enter once, and giveaway records survive bot restarts.

## Install

1. Create an application at [Discord Developer Portal](https://discord.com/developers/applications), name it **null**, and add a Bot user. Copy its **bot token** and **application ID**. Never share the token.
2. Under Installation, enable **Guild Install** with scopes `bot` and `applications.commands`. Grant the bot **View Channels**, **Send Messages**, **Embed Links**, **Read Message History**, and **Manage Channels**. Install it in your server. The person installing it needs Manage Server permission.
3. In Discord settings, enable Developer Mode; right-click your server and copy its ID.
4. Copy `.env.example` to `.env`, enter `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`. Optionally set `DATA_FILE` to a path on your host's persistent disk.
5. Run:

   ```bash
   npm install
   npm run deploy
   npm start
   ```

   `npm run deploy` registers the slash commands for the configured server. Re-run it when command definitions change. Keep `npm start` running on an always-on host.

6. Create a staff role, a tickets **category**, a private staff-only **applications** text channel, and a public **vouches** text channel. Ensure the bot can read and send messages in both text channels. Run `/setup` and select those resources. **Check that ordinary members cannot view the applications channel.** You can optionally select a logs channel.
7. Post `/panel type:tickets` and `/panel type:applications` in the channels where members should see them. Members can also use `/ticket open` and `/apply` directly.

## Operational notes

The bot uses only the Guilds gateway intent; Message Content and Server Members privileged intents are not needed. It must retain its channel permissions, and the staff role must retain access to the ticket category. Closed ticket channels stay available to staff until deleted; there is no transcript export. `/ticket delete` permanently removes the Discord channel. Application submissions and vouches are not automatically moderated. Giveaway winners are drawn at random from entrants; the bot checks for ended giveaways every 15 seconds and catches up after restarting. It must stay online to end giveaways on schedule. For a single running instance, local JSON storage is sufficient; do not run two copies against the same data file. For hosted deployment, configure a persistent volume for `DATA_FILE`.

To change application questions, edit `applicationModal()` and the matching field reads in `src/index.js`, then restart the bot. To change slash command definitions, edit `src/commands.js` and rerun `npm run deploy`.

## Host on Render

Render runs a Discord bot as a **Background Worker**, since the bot does not serve an HTTP website. A continuously running worker and the persistent disk used by this bot are **paid** Render resources. Check Render's checkout price before creating the service. The included `render.yaml` configures one worker, a 1 GB disk, command registration on each deploy, and the correct data path.

1. Create a GitHub repository and upload the **contents inside `null-bot`** to the repository root. The repository root must contain `package.json`, `package-lock.json`, `render.yaml`, and `src/`. Do **not** upload `.env`, `data/`, or `node_modules/`.
2. In Render, select **New → Blueprint**, connect that repository, and review the paid Background Worker and disk it will create. During setup, enter your real `DISCORD_TOKEN` (Bot Token), `CLIENT_ID` (Application ID), and `GUILD_ID` (server ID) when prompted. Keep the token secret. `DATA_FILE` is already set to `/var/data/state.json` on the disk.
3. Deploy. The build runs `npm ci`, command registration runs `npm run deploy`, and the worker starts with `npm start`. Look for `Registered 7 commands` and `null is online as ...` in Render logs.
4. After Render reports the worker is live, stop the local PowerShell copy with Ctrl+C. Keep **only one** copy of the bot running to avoid duplicate interactions and divergent data.

The Render disk starts empty. If your local bot already has saved tickets, applications, vouches, or giveaway records in `data/state.json`, a fresh Render worker will not inherit them. Transfer that file to `/var/data/state.json` on the Render disk before using the hosted copy if you need the existing records. Never commit that file to GitHub. If you choose to create the worker manually instead of using the Blueprint, use `npm ci` as Build Command, `npm run deploy && npm start` as Start Command, configure the same three secrets, and attach a disk at `/var/data` with `DATA_FILE=/var/data/state.json`.
