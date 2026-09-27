# Ironclad Bot — tickets, applications, vouches, levels, and giveaways

Node.js 20.11+ bot for multiple Discord servers. Set the bot's **display name** to `Ironclad Bot` in the Discord Developer Portal. Commands are registered globally, and each server has separate settings, tickets, applications, vouches, level balances, and giveaways. All records are stored in `data/state.json` by default. Keep that file on persistent storage and back it up.

## Features

- `/ticket open`: private channel for the member and staff. `/ticket close` locks the owner out of sending; staff can `/ticket reopen` or `/ticket delete`. Ticket owners and staff can `/ticket add` and `/ticket remove` other members.
- `/apply`: three-question application form. Staff receive Approve and Reject buttons in a private review channel; applicants receive a DM if permitted. A member can reapply after a decision.
- `/vouch user reason`: posts a public recommendation. Each member may vouch once per person, cannot vouch for themself or a bot, and the recipient must belong to the server. `/vouches user` shows the total and five recent reasons.
- `/panel type:ticket channel:...` or `/panel type:application channel:...`: posts a reusable button panel in any server text channel the bot can post in. The `channel` option is optional and defaults to the current channel. Tickets still open privately in the configured ticket category, and application reviews still go to the configured staff channel.
- `/giveaway start prize:... minutes:... winners:...`: staff post an entry button in the current channel. The giveaway ends automatically after 1–10,080 minutes and draws up to 10 unique winners. `/giveaway end message_id:...` draws early; `/giveaway reroll message_id:...` draws one additional winner, excluding prior winners. Members can enter once, and giveaway records survive bot restarts.
- `/level add user:... amount:...` and `/level remove user:... amount:...`: only members with the **Owner** or **Co Owner** role selected in `/setup` can edit balances. Levels are whole-number credits tracked by the bot, not Discord XP. Removing more than the member has is rejected. `/level balance` shows your available levels, and `/leaderboard` shows the top ten balances in this server.
- `/withdraw amount:...`: removes the chosen number of levels from your available balance and opens a private ticket showing who requested the withdrawal and how many levels. Members cannot withdraw more than they have. Staff can close the ticket using the regular ticket controls; closing does not refund the levels. Staff can refund a rejected request with `/level add`.
- `/giveaway level levels:... minutes:... winners:...`: Owner and Co Owner create a giveaway that awards the specified number of levels **to each winner** automatically when it ends. Only these roles can end or reroll a level giveaway; each reroll winner receives the same level amount.
- Web dashboard: visit the same Render Web Service URL, sign in with Discord, view and answer open tickets, browse vouches, start prize or level giveaways, and create native Discord polls. Staff can reply, launch prize giveaways, and create polls; Owner and Co-Owner can also launch level giveaways. Replies appear in the original Discord ticket channel, marked with the staff member's name. The site checks live server roles on each request.
- `/purge`: the **server owner** or members with the **Co-Owner role selected in /setup** can preview and confirm permanent deletion of the server's ticket channels, including open, closed, and withdrawal tickets. It deletes tracked ticket channels and ticket-named channels in the configured ticket category, then clears their saved ticket records. A confirmation expires in two minutes. The bot needs **Manage Channels** permission. Applications, vouches, giveaways, and level balances are left intact. Deleted ticket messages cannot be recovered.
- `/wipe`: the server owner or members with the configured **Owner** or **Co-Owner** role can confirm deletion of every message in the text channel where they run the command. It leaves the channel intact. The bot needs View Channel, Read Message History, and Manage Messages; older messages are deleted one by one and large channels can take time. Deleted messages cannot be recovered.
- `/poll create question:... answer_1:... answer_2:... hours:... channel:...`: staff, Owner, Co-Owner, or the server owner can post a native Discord poll. Add up to three more answers with `answer_3` through `answer_5`; duration defaults to 24 hours (1–768 supported), and channel defaults to the current text channel. The bot needs Create Polls in the target channel. Staff can also create polls on the website’s **Polls** page with 2–10 answers.

## Turn on the website

The website runs in the **same Node process and Render Web Service** as the bot. Its `/health` endpoint remains available even before website sign-in is configured. No second server or repository is needed.

1. In the Discord Developer Portal, open this bot application → **OAuth2**. Under **Redirects**, add `https://ironclad-bot.onrender.com/auth/callback` exactly. If your Render URL is different, replace the hostname.
2. Copy the application's **OAuth2 Client Secret** (different from the Bot Token). In the existing Render service, open **Environment** and add `DISCORD_CLIENT_SECRET` with that value. Never commit the secret or send it in chat.
3. In Render, add `PUBLIC_URL` with your service's full HTTPS URL, for example `https://ironclad-bot.onrender.com`, without a trailing slash. Keep `DISCORD_TOKEN`, `CLIENT_ID`, and `DATA_FILE` as before. Redeploy if Render does not deploy after saving environment variables.
4. Open the Render URL and sign in. The bot checks your configured Discord staff, Owner, or Co-Owner role before it shows server data. `/setup` in each server must be completed first.

The dashboard sessions are held in memory, so a redeploy signs users out. The bot's JSON store still needs a persistent disk: the current free Web Service does not provide one, and stored levels, tickets, vouches, and giveaway records can disappear on restart. A paid Web Service with a disk is needed to reliably preserve those records and run scheduled giveaways continuously.

### Install the dashboard on a phone

On Android, open the dashboard URL in Chrome, tap the three-dot menu, and choose **Install app** (or **Add to Home screen**). Sign in with Discord as usual. The installed dashboard opens from your home screen in its own window. It needs an internet connection to view tickets and manage the bot; only a generic offline message is stored on the phone. On iPhone, open the dashboard in Safari and use **Share → Add to Home Screen**. This is an installable web app, not an APK or an app-store download.

To receive phone alerts, open each server's dashboard overview in the installed app and tap **Enable notifications on this phone**. Allow notifications when prompted. Staff with access to the ticket or vouch channel receive alerts when someone opens a ticket, posts a vouch, or requests a level withdrawal. Tap an alert to open that item in the dashboard. The button can turn alerts off for that server; signing out clears saved phone subscriptions. Configure a stable `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` on the Render service before enabling alerts (generate a pair once with `npx web-push generate-vapid-keys`). Keep the private key secret and reuse the same pair after redeploys. Subscriptions are saved with the bot state file, so Render's Free Web Service can lose them on restart and will not receive events while asleep. Persistent storage and an always-on service are needed for reliable alerts.

## Install

1. Create an application at [Discord Developer Portal](https://discord.com/developers/applications), name it **Ironclad Bot**, and add a Bot user. Copy its **bot token** and **application ID**. Never share the token.
2. Under Installation, enable **Guild Install** with scopes `bot` and `applications.commands`. Grant the bot **View Channels**, **Send Messages**, **Embed Links**, **Read Message History**, **Manage Channels**, **Manage Messages**, **Create Polls**, and **Manage Roles**. Install it in each server. The person installing it needs Manage Server permission.
3. Copy `.env.example` to `.env`, enter `DISCORD_TOKEN` and `CLIENT_ID`. `GUILD_ID` is optional: set it to the original server ID once if you previously registered server-only commands, so the next deploy clears those copies. Optionally set `DATA_FILE` to a path on your host's persistent disk.
5. Run:

   ```bash
   npm install
   npm start
   ```

   `npm start` registers global slash commands for every server that installs the app, then starts the bot. New and updated global commands may take time to appear in Discord. Keep it running on an always-on host.

6. In **each server**, create a staff role, **Owner** and **Co Owner** roles, a tickets **category**, a private staff-only **applications** text channel, and a public **vouches** text channel. Ensure the bot can read and send messages in both text channels. Run `/setup` in that server and select those resources, including `owner_role` and `co_owner_role`. Existing servers must run `/setup` again to select the two new roles; their saved records are retained. **Check that ordinary members cannot view the applications channel.** You can optionally select a logs channel.
7. Use `/panel type:ticket channel:...` and `/panel type:application channel:...` to place the buttons in the text channels where members should see them. Leave out `channel` to post in the current text channel. Members can also use `/ticket open` and `/apply` directly.

## Operational notes

The bot uses the Guilds gateway intent; Message Content is not needed. It must retain its channel permissions, and the staff, Owner, and Co Owner roles must retain access to the ticket category. Closed ticket channels stay available to staff until deleted; there is no transcript export. `/ticket delete` and `/purge` permanently remove Discord channels. Application submissions and vouches are not automatically moderated. Giveaway winners are drawn at random from entrants; the bot checks for ended giveaways every 15 seconds and catches up after restarting. It must stay online to end giveaways on schedule. For a single running instance, local JSON storage is sufficient; do not run two copies against the same data file. For hosted deployment, configure a persistent volume for `DATA_FILE`, or levels and withdrawals may be lost on restart.

As a Render **Web Service**, the bot listens on Render's `PORT` and provides `/health` for port checks. A Free Web Service can go to sleep and has no persistent disk, so it cannot keep giveaways on schedule or reliably retain level balances. Use a paid Web Service with a disk for an always-on bot and dashboard with persistent records.

To change application questions, edit `applicationModal()` and the matching field reads in `src/index.js`, then restart the bot. To change slash command definitions, edit `src/commands.js` and rerun `npm run deploy`.

## Host on Render

Render runs the bot and dashboard as one **Web Service**. A continuously running paid Web Service and persistent disk are **paid** Render resources. Check Render's checkout price before creating a new service. The included `render.yaml` configures one Web Service, a 1 GB disk, command registration on each deploy, and the correct data path.

1. Create a GitHub repository and upload the **contents inside `ironclad-bot`** to the repository root. The repository root must contain `package.json`, `package-lock.json`, `render.yaml`, and `src/`. Do **not** upload `.env`, `data/`, or `node_modules/`.
2. In Render, select **New → Blueprint**, connect that repository, and review the paid Background Worker and disk it will create. During setup, enter your real `DISCORD_TOKEN` (Bot Token) and `CLIENT_ID` (Application ID) when prompted. Keep the token secret. `DATA_FILE` is already set to `/var/data/state.json` on the disk. For an existing Render service, keep its old `GUILD_ID` environment variable through one deployment to remove its old server-only commands.
3. Deploy. The build runs `npm ci`, and `npm start` registers commands before starting the worker. Look for `Registered 13 global commands` and `Ironclad Bot is online as ...` in Render logs.
4. After Render reports the worker is live, stop the local PowerShell copy with Ctrl+C. Keep **only one** copy of the bot running to avoid duplicate interactions and divergent data.

The Render disk starts empty. If your local bot already has saved tickets, applications, vouches, level balances, or giveaway records in `data/state.json`, a fresh Render worker will not inherit them. Transfer that file to `/var/data/state.json` on the Render disk before using the hosted copy if you need the existing records. Never commit that file to GitHub. If you choose to create the worker manually instead of using the Blueprint, use `npm ci` as Build Command, `npm start` as Start Command, configure the token and application ID, and attach a disk at `/var/data` with `DATA_FILE=/var/data/state.json`.
