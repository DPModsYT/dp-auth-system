const { Telegraf } = require('telegraf');
const axios = require('axios');

// अपने Render के Environment Variables से टोकन उठाएं
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // e.g., "username/repo"

let db = { settings: {}, devices: {} };
let ghSha = "";

async function syncFromGitHub() {
    const res = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/contents/database.json`, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
    db = JSON.parse(Buffer.from(res.data.content, 'base64').toString('utf8'));
    ghSha = res.data.sha;
}

async function saveToGitHub() {
    const content = Buffer.from(JSON.stringify(db, null, 2)).toString('base64');
    await axios.put(`https://api.github.com/repos/${GITHUB_REPO}/contents/database.json`, {
        message: "Bot Update", content: content, sha: ghSha
    }, { headers: { Authorization: `token ${GITHUB_TOKEN}` } });
    await syncFromGitHub(); // SHA अपडेट करने के लिए
}

// --- Commands ---

bot.command('devices', async (ctx) => {
    await syncFromGitHub();
    let msg = "📱 *Registered Devices:*\n\n";
    for (let id in db.devices) {
        msg += `ID: \`${id}\` | Status: ${db.devices[id].status}\n`;
    }
    ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('approve', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply("Usage: /approve <HWID> <Days>");
    
    await syncFromGitHub();
    const hwid = args[1];
    const days = parseInt(args[2]);
    const expiry = Math.floor(Date.now() / 1000) + (days * 86400);

    db.devices[hwid] = { status: "approved", expiry: expiry };
    await saveToGitHub();
    ctx.reply(`✅ Approved ${hwid} for ${days} days.`);
});

bot.command('ban', async (ctx) => {
    await syncFromGitHub();
    const hwid = ctx.message.text.split(' ')[1];
    if (!hwid) return ctx.reply("Usage: /ban <HWID>");
    
    db.devices[hwid] = { status: "banned", expiry: 0 };
    await saveToGitHub();
    ctx.reply(`🚫 Banned: ${hwid}`);
});

bot.command('settings', (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply("Usage: /settings <title/sub> <text>");
    
    const key = args[1];
    const val = args.slice(2).join(' ');
    
    if (key === 'title') db.settings.title = val;
    else if (key === 'sub') db.settings.subtitle = val;
    
    saveToGitHub();
    ctx.reply(`✅ Settings updated: ${key} -> ${val}`);
});

// Start Bot
syncFromGitHub().then(() => {
    bot.launch();
    console.log("Bot is Running...");
});
