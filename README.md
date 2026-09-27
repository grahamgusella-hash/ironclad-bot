# Ironclad Bot — tickets, applications, vouches, levels, and giveaways

Node.js 20.11+ bot for multiple Discord servers. Set the bot's **display name** to `Ironclad Bot` in the Discord Developer Portal. Commands are registered globally, and each server has separate settings, tickets, applications, vouches, level balances, and giveaways. All records are stored in `data/state.json` by default on your own computer. Set `DATABASE_URL` to use Neon Postgres for persistent storage on Render. Back up important records.

## Features

- `/ticket open`: private channel for the member and staff. `/ticket close` locks the owner out of sending; staff can `/ticket reopen` or `/ticket delete`. Ticket owners and staff can `/ticket add` and `/ticket remove` other members.
- `/apply`: three-question application form. Each submission opens a private ticket in the configured ticket category where the applicant and staff can talk. The configured applications channel receives a link to the ticket. Staff can decline an application; reviewers with Manage Roles can approve and choose an assignable server role from Discord or the website. The bot also needs Manage Roles and its role must be above the selected role. Applicants receive the decision in their ticket and by DM if permitted. A member can reapply after a decision.
- `/vouch user reason`: posts a public recommendation. Each member may vouch once per person, cannot vouch for themself or a bot, and the recipient must belong to the server. `/vouches user` shows the total and five recent reasons.
- `/panel type:ticket channel:...` or `/panel type:application channel:...`: posts a reusable button panel in any server text channel the bot can post in. The `channel` option is optional and defaults to the current channel. Tickets still open privately in the configured ticket category, and application reviews still go to the configured staff channel.
- `/giveaway start prize:... minutes:... winners:...`: staff post an entry button in the current channel. The giveaway ends automatically after 1–10,080 minutes and draws up to 10 unique winners. `/giveaway end message_id:...` draws early; `/giveaway reroll message_id:...` draws one additional winner, excluding prior winners. Members can enter once, and giveaway records survive bot restarts.
- `/level add user:... amount:...` and `/level remove user:... amount:...`: only members with the **Owner** or **Co Owner** role selected in `/setup` can edit balances. Levels are whole-number credits tracked by the bot, not Discord XP. Removing more than the member has is rejected. `/level balance` shows your available levels, and `/leaderboard` shows the top ten balances in this server.
- `/withdraw amount:...`: removes the chosen number of levels from your available balance and opens a private ticket showing who requested the withdrawal and how many levels. Members cannot withdraw more than they have. Staff can close the ticket using the regular ticket controls; closing does not refund the levels. Staff can refund a rejected request with `/level add`.
- `/giveaway level levels:... minutes:... winners:...`: Owner and Co Owner create a giveaway that awards the specified number of levels **to each winner** automatically when it ends. Only these roles can end or reroll a level giveaway; each reroll winner receives the same level amount.
- Web dashboard: visit the same Render Web Service URL, sign in with Discord, view and answer open tickets and application tickets, approve or decline applications with a selected role, browse vouches, start prize or level giveaways, and create and review native Discord polls. Staff can reply, launch prize giveaways, and create polls; reviewers with Manage Roles can assign application roles, and Owner and Co-Owner can launch level giveaways. Replies appear in the original Discord ticket channel, marked with the staff member's name. The site checks live server roles on each request.
- `/purge`: the **server owner** or members with the **Co-Owner role selected in /setup** can preview and confirm permanent deletion of the server's ticket channels, including open, closed, withdrawal, and application tickets. It deletes tracked ticket channels and ticket-named channels in the configured ticket category, then clears their saved ticket records. Pending applications in deleted tickets are canceled so applicants may reapply. A confirmation expires in two minutes. The bot needs **Manage Channels** permission. Vouches, giveaways, and level balances are left intact. Deleted ticket messages cannot be recovered.
- `/wipe`: the server owner or members with the configured **Owner** or **Co-Owner** role can confirm deletion of every message in the text channel where they run the command. It leaves the channel intact. The bot needs View Channel, Read Message History, and Manage Messages; older messages are deleted one by one and large channels can take time. Deleted messages cannot be recovered.
- `/poll create question:... answer_1:... answer_2:... hours:... channel:...`: staff, Owner, Co-Owner, or the server owner can post a native Discord poll. Add up to three more answers with `answer_3` through `answer_5`; duration defaults to 24 hours (1–768 supported), and channel defaults to the current text channel. The bot needs Create Polls in the target channel. Staff can create polls on the website’s **Polls** page with 2–10 answers and view recent polls with their votes. Polls made before the update are discovered from up to 50 recent messages in the first 12 viewable channels.

## Turn on the website

The website runs in the **same Node process and Render Web Service** as the bot. Its `/health` endpoint remains available even before website sign-in is configured. No second server or repository is needed.

1. In the Discord Developer Portal, open this bot application → **OAuth2**. Under **Redirects**, add `https://ironclad-bot.onrender.com/auth/callback` exactly. If your Render URL is different, replace the hostname.
2. Copy the application's **OAuth2 Client Secret** (different from the Bot Token). In the existing Render service, open **Environment** and add `DISCORD_CLIENT_SECRET` with that value. Never commit the secret or send it in chat.
3. In Render, add `PUBLIC_URL` with your service's full HTTPS URL, for example `https://ironclad-bot.onrender.com`, without a trailing slash. Keep `DISCORD_TOKEN` and `CLIENT_ID` as before. Redeploy if Render does not deploy after saving environment variables.
4. Open the Render URL and sign in. The bot checks your configured Discord staff, Owner, or Co-Owner role before it shows server data. `/setup` in each server must be completed first.

The dashboard sessions are held in memory, so a redeploy signs users out. Configure `DATABASE_URL` with a Neon connection string to retain setup, levels, tickets, vouches, and giveaways across Render restarts. Render Free can still go to sleep, so giveaways may finish late when the bot wakes.

### Install the dashboard on a phone

On Android, open the dashboard URL in Chrome, tap the three-dot menu, and choose **Install app** (or **Add to Home screen**). Sign in with Discord as usual. The installed dashboard opens from your home screen in its own window. It needs an internet connection to view tickets and manage the bot; only a generic offline message is stored on the phone. On iPhone, open the dashboard in Safari and use **Share → Add to Home Screen**. This is an installable web app, not an APK or an app-store download.

To receive phone alerts, open each server's dashboard overview in the installed app and tap **Enable notifications on this phone**. Allow notifications when prompted. Staff with access to the ticket or vouch channel receive alerts when someone opens a ticket, posts a vouch, or requests a level withdrawal. Tap an alert to open that item in the dashboard. The button can turn alerts off for that server; signing out clears saved phone subscriptions. Configure a stable `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` on the Render service before enabling alerts (generate a pair once with `npx web-push generate-vapid-keys`). Keep the private key secret and reuse the same pair after redeploys. Subscriptions are saved with the other bot data in Neon when `DATABASE_URL` is set. Render Free still cannot deliver alerts while its web service is asleep.

## Install

1. Create an application at [Discord Developer Portal](https://discord.com/developers/applications), name it **Ironclad Bot**, and add a Bot user. Copy its **bot token** and **application ID**. Never share the token.
2. Under Installation, enable **Guild Install** with scopes `bot` and `applications.commands`. Grant the bot **View Channels**, **Send Messages**, **Embed Links**, **Read Message History**, **Manage Channels**, **Manage Messages**, **Create Polls**, and **Manage Roles**. Install it in each server. The person installing it needs Manage Server permission.
3. Copy `.env.example` to `.env`, enter `DISCORD_TOKEN` and `CLIENT_ID`. `GUILD_ID` is optional: set it to the original server ID once if you previously registered server-only commands, so the next deploy clears those copies. For local use, optionally set `DATA_FILE` to a path on your host's persistent disk. On Render, set `DATABASE_URL` instead.
5. Run:

   ```bash
   npm install
   npm start
   ```

   `npm start` registers global slash commands for every server that installs the app, then starts the bot. New and updated global commands may take time to appear in Discord. Keep it running on an always-on host.

6. In **each server**, create a staff role, **Owner** and **Co Owner** roles, a tickets **category**, a private staff-only **applications** text channel, and a public **vouches** text channel. Ensure the bot can read and send messages in both text channels. Run `/setup` in that server and select those resources, including `owner_role` and `co_owner_role`. Existing servers must run `/setup` again to select the two new roles; their saved records are retained. **Check that ordinary members cannot view the applications channel.** You can optionally select a logs channel.
7. Use `/panel type:ticket channel:...` and `/panel type:application channel:...` to place the buttons in the text channels where members should see them. Leave out `channel` to post in the current text channel. Members can also use `/ticket open` and `/apply` directly.

## Operational notes

The bot uses the Guilds gateway intent; Message Content is not needed. It must retain its channel permissions, and the staff, Owner, and Co Owner roles must retain access to the ticket category. Closed ticket channels stay available to staff until deleted; there is no transcript export. `/ticket delete` and `/purge` permanently remove Discord channels. Application submissions and vouches are not automatically moderated. Giveaway winners are drawn at random from entrants; the bot checks for ended giveaways every 15 seconds and catches up after restarting. It must stay online to end giveaways on schedule. For a single locally running instance, local JSON storage is sufficient. On Render, set `DATABASE_URL` to Neon to persist all bot data; do not run a second bot copy against the same Neon database.

As a Render **Web Service**, the bot listens on Render's `PORT` and provides `/health` for port checks. A Free Web Service can go to sleep and has no persistent disk. Neon preserves level balances across restarts when `DATABASE_URL` is set; a sleeping bot will finish giveaways late after it wakes. For timely giveaways and alerts, run an always-on service.

To change application questions, edit `applicationModal()` and the matching field reads in `src/index.js`, then restart the bot. To change slash command definitions, edit `src/commands.js` and rerun `npm run deploy`.

## Host on Render with Neon

The bot and dashboard run together on the existing Render Web Service. Neon stores their shared data in Postgres so Render restarts do not reset `/setup`.

1. Create a Neon project with **Postgres database** enabled. In Neon, use **Connect** to copy its Postgres connection string, including `sslmode=require`. Keep it private.
2. In the **existing** Render Web Service, open **Environment** and add `DATABASE_URL` with that entire string. Do not paste it into chat or GitHub. Keep your existing Discord and website variables.
3. Deploy this version of the bot after `DATABASE_URL` is set. It creates the `ironclad_state` table and loads the saved record before connecting to Discord or opening the website. Check the Render logs for `Ironclad data loaded from Postgres`.
4. Run `/setup` once if Render has already deleted its old temporary file. Test that setup and a small level balance remain after a restart.

Render's current temporary `state.json` is not available through Shell on the Free plan and is not automatically migrated. If you have an existing `state.json` on your own computer, set `DATA_FILE` to it for the first Neon startup; only an empty database will import it. Do not commit the file or connection string. The included `render.yaml` describes a **new** free service and should not be applied to the existing service because it could create a duplicate bot. Keep only one bot instance running per database.
