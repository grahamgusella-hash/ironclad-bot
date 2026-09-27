# Ironclad Bot — tickets, applications, vouches, levels, and giveaways

Node.js 20.11+ bot for multiple Discord servers. Set the bot's **display name** to `Ironclad Bot` in the Discord Developer Portal. Commands are registered globally, and each server has separate settings, tickets, applications, vouches, level balances, and giveaways. All records are stored in `data/state.json` by default. Keep that file on persistent storage and back it up.

## Features

- `/ticket open`: private channel for the member and staff. `/ticket close` locks the owner out of sending; staff can `/ticket reopen` or `/ticket delete`. Ticket owners and staff can `/ticket add` and `/ticket remove` other members.
- `/apply`: three-question application form. Staff receive Approve and Reject buttons in a private review channel; applicants receive a DM if permitted. A member can reapply after a decision.
- `/vouch user reason`: posts a public recommendation. Each member may vouch once per person, cannot vouch for themself or a bot, and the recipient must belong to the server. `/vouches user` shows the total and five recent reasons.
- `/panel type:tickets` or `/panel type:applications`: posts a reusable button panel in the current channel.
- `/giveaway start prize:... minutes:... winners:...`: staff post an entry button in the current channel. The giveaway ends automatically after 1–10,080 minutes and draws up to 10 unique winners. `/giveaway end message_id:...` draws early; `/giveaway reroll message_id:...` draws one additional winner, excluding prior winners. Members can enter once, and giveaway records survive bot restarts.
- `/level add user:... amount:...` and `/level remove user:... amount:...`: only members with the **Owner** or **Co Owner** role selected in `/setup` can edit balances. Levels are whole-number credits tracked by the bot, not Discord XP. Removing more than the member has is rejected. `/level balance` shows your available levels, and `/leaderboard` shows the top ten balances in this server.
- `/withdraw amount:...`: removes the chosen number of levels from your available balance and opens a private ticket showing who requested the withdrawal and how many levels. Members cannot withdraw more than they have. Staff can close the ticket using the regular ticket controls; closing does not refund the levels. Staff can refund a rejected request with `/level add`.
- `/giveaway level levels:... minutes:... winners:...`: Owner and Co Owner create a giveaway that awards the specified number of levels **to each winner** automatically when it ends. Only these roles can end or reroll a level giveaway; each reroll winner receives the same level amount.

## Install

1. Create an application at [Discord Developer Portal](https://discord.com/developers/applications), name it **Ironclad Bot**, and add a Bot user. Copy its **bot token** and **application ID**. Never share the token.
2. Under Installation, enable **Guild Install** with scopes `bot` and `applications.commands`. Grant the bot **View Channels**, **Send Messages**, **Embed Links**, **Read Message History**, **Manage Channels**, and **Manage Roles**. Install it in each server. The person installing it needs Manage Server permission.
3. Copy `.env.example` to `.env`, enter `DISCORD_TOKEN` and `CLIENT_ID`. `GUILD_ID` is optional: set it to the original server ID once if you previously registered server-only commands, so the next deploy clears those copies. Optionally set `DATA_FILE` to a path on your host's persistent disk.
5. Run:

   ```bash
   npm install
   npm start
   ```

   `npm start` registers global slash commands for every server that installs the app, then starts the bot. New and updated global commands may take time to appear in Discord. Keep it running on an always-on host.

6. In **each server**, create a staff role, **Owner** and **Co Owner** roles, a tickets **category**, a private staff-only **applications** text channel, and a public **vouches** text channel. Ensure the bot can read and send messages in both text channels. Run `/setup` in that server and select those resources, including `owner_role` and `co_owner_role`. Existing servers must run `/setup` again to select the two new roles; their saved records are retained. **Check that ordinary members cannot view the applications channel.** You can optionally select a logs channel.
7. Post `/panel type:tickets` and `/panel type:applications` in the channels where members should see them. Members can also use `/ticket open` and `/apply` directly.

## Operational notes

The bot uses only the Guilds gateway intent; Message Content and Server Members privileged intents are not needed. It must retain its channel permissions, and the staff, Owner, and Co Owner roles must retain access to the ticket category. Closed ticket channels stay available to staff until deleted; there is no transcript export. `/ticket delete` permanently removes the Discord channel. Application submissions and vouches are not automatically moderated. Giveaway winners are drawn at random from entrants; the bot checks for ended giveaways every 15 seconds and catches up after restarting. It must stay online to end giveaways on schedule. For a single running instance, local JSON storage is sufficient; do not run two copies against the same data file. For hosted deployment, configure a persistent volume for `DATA_FILE`, or levels and withdrawals may be lost on restart.

If deployed as a Render **Web Service**, the bot also listens on Render's `PORT` and provides `/health` for port checks. A Free Web Service can go to sleep and has no persistent disk, so it cannot keep giveaways on schedule or reliably retain level balances. Use a paid Background Worker and persistent disk (or a paid Web Service with a disk) for this bot.

To change application questions, edit `applicationModal()` and the matching field reads in `src/index.js`, then restart the bot. To change slash command definitions, edit `src/commands.js` and rerun `npm run deploy`.

## Host on Render

Render runs a Discord bot as a **Background Worker**, since the bot does not serve an HTTP website. A continuously running worker and the persistent disk used by this bot are **paid** Render resources. Check Render's checkout price before creating the service. The included `render.yaml` configures one worker, a 1 GB disk, command registration on each deploy, and the correct data path.

1. Create a GitHub repository and upload the **contents inside `ironclad-bot`** to the repository root. The repository root must contain `package.json`, `package-lock.json`, `render.yaml`, and `src/`. Do **not** upload `.env`, `data/`, or `node_modules/`.
2. In Render, select **New → Blueprint**, connect that repository, and review the paid Background Worker and disk it will create. During setup, enter your real `DISCORD_TOKEN` (Bot Token) and `CLIENT_ID` (Application ID) when prompted. Keep the token secret. `DATA_FILE` is already set to `/var/data/state.json` on the disk. For an existing Render service, keep its old `GUILD_ID` environment variable through one deployment to remove its old server-only commands.
3. Deploy. The build runs `npm ci`, and `npm start` registers commands before starting the worker. Look for `Registered 10 global commands` and `Ironclad Bot is online as ...` in Render logs.
4. After Render reports the worker is live, stop the local PowerShell copy with Ctrl+C. Keep **only one** copy of the bot running to avoid duplicate interactions and divergent data.

The Render disk starts empty. If your local bot already has saved tickets, applications, vouches, level balances, or giveaway records in `data/state.json`, a fresh Render worker will not inherit them. Transfer that file to `/var/data/state.json` on the Render disk before using the hosted copy if you need the existing records. Never commit that file to GitHub. If you choose to create the worker manually instead of using the Blueprint, use `npm ci` as Build Command, `npm start` as Start Command, configure the token and application ID, and attach a disk at `/var/data` with `DATA_FILE=/var/data/state.json`.
