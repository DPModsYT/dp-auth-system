const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(process.env.BOT_TOKEN);

// 🟢 MULTIPLE ADMINS SETUP 🟢
const ADMIN_IDS = process.env.ADMIN_ID ? process.env.ADMIN_ID.split(',').map(id => id.trim()) : [];
const GROUP_ID = process.env.GROUP_ID; 
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

let db = { settings: {}, devices: {} };
let ghSha = "";

// 🟢 ADMIN CHECKER FUNCTION 🟢
function isAdmin(ctx) {
    if (ADMIN_IDS.includes(ctx.from.id.toString())) {
        return true;
    } else {
        ctx.reply("❌ *You are not authorized to use this panel!*", { parse_mode: 'Markdown' }).catch(e => console.log(e));
        return false;
    }
}

// GitHub से डेटाबेस सिंक करना
async function syncFromGitHub() {
    try {
        const res = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/contents/database.json`, {
            headers: { Authorization: `token ${GITHUB_TOKEN}` }
        });
        db = JSON.parse(Buffer.from(res.data.content, 'base64').toString('utf8'));
        ghSha = res.data.sha;
    } catch (e) { console.log("GitHub Load Error"); }
}

// GitHub पर डेटाबेस सेव करना
async function saveToGitHub() {
    try {
        const content = Buffer.from(JSON.stringify(db, null, 2)).toString('base64');
        const res = await axios.put(`https://api.github.com/repos/${GITHUB_REPO}/contents/database.json`, {
            message: "Bot Update", content: content, sha: ghSha
        }, { headers: { Authorization: `token ${GITHUB_TOKEN}` } });
        ghSha = res.data.content.sha;
    } catch (e) { console.log("GitHub Save Error"); }
}

// Android ऐप से रिक्वेस्ट रिसीव करना
app.get('/api/request', async (req, res) => {
    const hwid = req.query.hwid;
    if (!hwid) return res.status(400).send("No HWID");
    
    await syncFromGitHub();
    if (!db.devices[hwid]) {
        db.devices[hwid] = { status: "pending", expiry: 0 };
        await saveToGitHub();
    }
    
    const msg = `🔔 *NEW REQUEST*\n\n*HWID:* \`${hwid}\`\n\n*Quick Commands:*\n\`/approve ${hwid} 30\`\n\`/ban ${hwid}\`\n\`/remove ${hwid}\`\n\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`;
    
    bot.telegram.sendMessage(GROUP_ID, msg, { parse_mode: 'Markdown' }).catch(e => console.log("Send Error:", e.message));
    res.send("Requested");
});

// ==========================================
// 🤖 TELEGRAM BOT COMMANDS
// ==========================================

// 1. HELP COMMAND
bot.command('help', (ctx) => {
    if (!isAdmin(ctx)) return;
    const helpMsg = `🛠 *PANEL BOT COMMANDS* 🛠\n\n`
        + `🟢 */approve <HWID> <Days>* - Approve a device\n`
        + `🔴 */ban <HWID>* - Ban a device permanently\n`
        + `🗑 */remove <HWID>* - Delete device completely\n`
        + `📱 */devices* - View all registered devices\n`
        + `⚙️ */settings* - View current panel settings\n`
        + `✏️ */settings title <text>* - Change panel title\n`
        + `✏️ */settings sub <text>* - Change panel subtitle\n`
        + `🛠 */maintenance* - Toggle maintenance mode ON/OFF\n\n`
        + `_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`;
    ctx.reply(helpMsg, { parse_mode: 'Markdown' }).catch(e => console.log(e));
});

// 2. DEVICES COMMAND
bot.command('devices', async (ctx) => {
    if (!isAdmin(ctx)) return; 
    
    await syncFromGitHub();
    let msg = "📱 *Registered Devices:*\n\n";
    let count = 0;
    for (let id in db.devices) { 
        msg += `\`${id}\` : ${db.devices[id].status.toUpperCase()}\n`; 
        count++;
    }
    if (count === 0) msg += "No devices found in database.\n";
    
    msg += "\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_";
    ctx.reply(msg, { parse_mode: 'Markdown' }).catch(e => console.log(e));
});

// 3. APPROVE COMMAND
bot.command('approve', async (ctx) => {
    if (!isAdmin(ctx)) return; 
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply("ℹ️ *Usage:* `/approve <HWID> <Days>`\n_Example: /approve 87d7ea... 30_", { parse_mode: 'Markdown' });
    
    await syncFromGitHub();
    const hwid = args[1];
    const days = parseInt(args[2]);
    const expiry = Math.floor(Date.now() / 1000) + (days * 86400);

    if (!db.devices[hwid]) db.devices[hwid] = {};
    db.devices[hwid] = { status: "approved", expiry: expiry };
    await saveToGitHub();
    
    const successMsg = `✅ *SUCCESSFULLY APPROVED!*\n\n*HWID:* \`${hwid}\`\n*Duration:* ${days} Days\n\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`;
    ctx.reply(successMsg, { parse_mode: 'Markdown' }).catch(e => console.log(e));
});

// 4. BAN COMMAND
bot.command('ban', async (ctx) => {
    if (!isAdmin(ctx)) return; 
    
    const hwid = ctx.message.text.split(' ')[1];
    if (!hwid) return ctx.reply("ℹ️ *Usage:* `/ban <HWID>`", { parse_mode: 'Markdown' });
    
    await syncFromGitHub();
    if (!db.devices[hwid]) db.devices[hwid] = {};
    db.devices[hwid] = { status: "banned", expiry: 0 };
    await saveToGitHub();
    
    const banMsg = `🚫 *BANNED SUCCESSFULLY*\n\n*HWID:* \`${hwid}\`\n\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`;
    ctx.reply(banMsg, { parse_mode: 'Markdown' }).catch(e => console.log(e));
});

// 5. REMOVE COMMAND (NEW)
bot.command('remove', async (ctx) => {
    if (!isAdmin(ctx)) return; 
    
    const hwid = ctx.message.text.split(' ')[1];
    if (!hwid) return ctx.reply("ℹ️ *Usage:* `/remove <HWID>`", { parse_mode: 'Markdown' });
    
    await syncFromGitHub();
    
    if (db.devices[hwid]) {
        delete db.devices[hwid]; // यह JSON से डिवाइस को उड़ा देगा
        await saveToGitHub();
        const removeMsg = `🗑 *REMOVED SUCCESSFULLY*\n\n*HWID:* \`${hwid}\` has been deleted from the database.\n\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`;
        ctx.reply(removeMsg, { parse_mode: 'Markdown' }).catch(e => console.log(e));
    } else {
        ctx.reply(`⚠️ *Device Not Found:*\n\`${hwid}\` is not in the database.\n\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`, { parse_mode: 'Markdown' }).catch(e => console.log(e));
    }
});

// 6. SMART SETTINGS COMMAND (UPDATED)
bot.command(['settings', 'setting'], async (ctx) => {
    if (!isAdmin(ctx)) return; 
    await syncFromGitHub();
    const args = ctx.message.text.split(' ');
    
    // अगर सिर्फ "/settings" टाइप किया है
    if (args.length === 1) {
        const currentSettings = `⚙️ *CURRENT SETTINGS*\n\n`
            + `*Title:* ${db.settings.title || 'N/A'}\n`
            + `*Subtitle:* ${db.settings.subtitle || 'N/A'}\n`
            + `*Maintenance:* ${db.settings.maintenance ? 'ON 🔴' : 'OFF 🟢'}\n\n`
            + `_To change settings, use:_\n\`/settings title <New Title>\`\n\`/settings sub <New Subtitle>\`\n\n`
            + `_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`;
        return ctx.reply(currentSettings, { parse_mode: 'Markdown' }).catch(e => console.log(e));
    }

    if (args.length < 3) return ctx.reply("ℹ️ *Usage:* `/settings title <text>` OR `/settings sub <text>`", { parse_mode: 'Markdown' });
    
    const key = args[1].toLowerCase();
    const val = args.slice(2).join(' ');
    
    if (key === 'title') db.settings.title = val;
    else if (key === 'sub') db.settings.subtitle = val;
    else return ctx.reply("❌ Invalid setting. Use 'title' or 'sub'.");
    
    await saveToGitHub();
    const setMsg = `✅ *Setting Updated!*\n*${key.toUpperCase()}:* ${val}\n\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`;
    ctx.reply(setMsg, { parse_mode: 'Markdown' }).catch(e => console.log(e));
});

// 7. MAINTENANCE COMMAND
bot.command('maintenance', async (ctx) => {
    if (!isAdmin(ctx)) return;
    await syncFromGitHub();
    db.settings.maintenance = !db.settings.maintenance;
    await saveToGitHub();
    ctx.reply(`🛠 *Maintenance Mode is now:* ${db.settings.maintenance ? 'ON 🔴' : 'OFF 🟢'}\n\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`, { parse_mode: 'Markdown' }).catch(e => console.log(e));
});

// Start the server and bot
syncFromGitHub().then(() => {
    app.listen(PORT, () => console.log("Server Running..."));
    bot.launch();
});
