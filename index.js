const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID; 
const GROUP_ID = process.env.GROUP_ID; 
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

let db = { settings: {}, devices: {} };
let ghSha = "";

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

// 🟢 Android ऐप से रिक्वेस्ट रिसीव करना 🟢
app.get('/api/request', async (req, res) => {
    const hwid = req.query.hwid;
    if (!hwid) return res.status(400).send("No HWID");
    
    await syncFromGitHub();
    if (!db.devices[hwid]) {
        db.devices[hwid] = { status: "pending", expiry: 0 };
        await saveToGitHub();
    }
    
    // 🌟 वॉटरमार्क यहाँ ऐड किया गया है 🌟
    const msg = `🔔 *NEW REQUEST*\n\n*HWID:* \`${hwid}\`\n\n*Quick Commands:*\n\`/approve ${hwid} 30\`\n\`/ban ${hwid}\`\n\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`;
    
    bot.telegram.sendMessage(GROUP_ID, msg, { parse_mode: 'Markdown' }).catch(e => console.log("Send Error:", e.message));
    res.send("Requested");
});

// Telegram Bot Commands
bot.command('devices', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await syncFromGitHub();
    let msg = "📱 *Devices:*\n\n";
    for (let id in db.devices) { msg += `\`${id}\` : ${db.devices[id].status}\n`; }
    msg += "\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_";
    ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('approve', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return; 
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply("Usage: /approve <HWID> <Days>");
    
    await syncFromGitHub();
    const hwid = args[1];
    const days = parseInt(args[2]);
    const expiry = Math.floor(Date.now() / 1000) + (days * 86400);

    if (!db.devices[hwid]) db.devices[hwid] = {};
    db.devices[hwid] = { status: "approved", expiry: expiry };
    await saveToGitHub();
    
    // 🌟 वॉटरमार्क यहाँ भी ऐड किया गया है 🌟
    ctx.reply(`✅ Approved \`${hwid}\` for ${days} days.\n\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`, { parse_mode: 'Markdown' });
});

bot.command('ban', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const hwid = ctx.message.text.split(' ')[1];
    if (!hwid) return ctx.reply("Usage: /ban <HWID>");
    
    await syncFromGitHub();
    if (!db.devices[hwid]) db.devices[hwid] = {};
    db.devices[hwid] = { status: "banned", expiry: 0 };
    await saveToGitHub();
    
    // 🌟 वॉटरमार्क यहाँ भी ऐड किया गया है 🌟
    ctx.reply(`🚫 Banned: \`${hwid}\`\n\n_ᴘᴀɴᴇʟ ʙʏ ᴅᴘᴍᴏᴅꜱ_`, { parse_mode: 'Markdown' });
});

syncFromGitHub().then(() => {
    app.listen(PORT, () => console.log("Server Running..."));
    bot.launch();
});
