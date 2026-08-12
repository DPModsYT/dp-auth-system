const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(process.env.BOT_TOKEN);

// 🟢 MULTIPLE ADMINS SETUP 🟢
// Render में ADMIN_ID ऐसे डालें: 12345678, 87654321
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
        ctx.reply("❌ You are not the admin of this bot!").catch(e => console.log(e));
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
    
    const msg = `🔔 *NEW REQUEST*\n\n*HWID:* \`${hwid}\`\n\n*Quick Commands:*\n\`/approve ${hwid} 30\`\n\`/ban ${hwid}\`\n\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`;
    
    bot.telegram.sendMessage(GROUP_ID, msg, { parse_mode: 'Markdown' }).catch(e => console.log("Send Error:", e.message));
    res.send("Requested");
});

// ==========================================
// 🤖 TELEGRAM BOT COMMANDS
// ==========================================

bot.command('devices', async (ctx) => {
    if (!isAdmin(ctx)) return; // Admin Check
    
    await syncFromGitHub();
    let msg = "📱 *Registered Devices:*\n\n";
    for (let id in db.devices) { 
        msg += `\`${id}\` : ${db.devices[id].status.toUpperCase()}\n`; 
    }
    msg += "\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_";
    ctx.reply(msg, { parse_mode: 'Markdown' }).catch(e => console.log(e));
});

bot.command('approve', async (ctx) => {
    if (!isAdmin(ctx)) return; // Admin Check
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply("Usage: /approve <HWID> <Days>");
    
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

bot.command('ban', async (ctx) => {
    if (!isAdmin(ctx)) return; // Admin Check
    
    const hwid = ctx.message.text.split(' ')[1];
    if (!hwid) return ctx.reply("Usage: /ban <HWID>");
    
    await syncFromGitHub();
    if (!db.devices[hwid]) db.devices[hwid] = {};
    db.devices[hwid] = { status: "banned", expiry: 0 };
    await saveToGitHub();
    
    const banMsg = `🚫 *BANNED SUCCESSFULLY*\n\n*HWID:* \`${hwid}\`\n\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`;
    ctx.reply(banMsg, { parse_mode: 'Markdown' }).catch(e => console.log(e));
});

// Supports both /settings and /setting
bot.command(['settings', 'setting'], async (ctx) => {
    if (!isAdmin(ctx)) return; // Admin Check
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply("Usage: /settings <title/sub> <text>");
    
    await syncFromGitHub();
    const key = args[1].toLowerCase();
    const val = args.slice(2).join(' ');
    
    if (key === 'title') db.settings.title = val;
    else if (key === 'sub') db.settings.subtitle = val;
    else return ctx.reply("❌ Invalid setting. Use 'title' or 'sub'.");
    
    await saveToGitHub();
    const setMsg = `✅ *Setting Updated!*\n*${key.toUpperCase()}:* ${val}\n\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`;
    ctx.reply(setMsg, { parse_mode: 'Markdown' }).catch(e => console.log(e));
});

// Start the server and bot
syncFromGitHub().then(() => {
    app.listen(PORT, () => console.log("Server Running..."));
    bot.launch();
});
