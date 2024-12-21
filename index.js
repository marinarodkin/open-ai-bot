require('dotenv').config()
const { generate } = require('./generate')
const { scraping } = require('./scraping')
const { sendResultToNotion } = require('./send-to-notion')
const { Telegraf } = require('telegraf')
const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();

const TELEGRAM_API_TOKEN = process.env.TELEGRAM_API_TOKEN

const bot = new Telegraf(TELEGRAM_API_TOKEN)
const queue = []

bot.start((ctx) => ctx.reply('Send me a link'))
bot.on('text', async (ctx) => {
    const linkFromTel = ctx.message.text
    const isValidLink = isValidYouTubeLink(linkFromTel)

    if (!isValidLink) {
        ctx.reply('link is not valid, send me a valid YouTube link')
    } else {
        // Add the request to the queue
        queue.push(ctx)

        // If the request is the only one in the queue, process it
        if (queue.length === 1) {
            processQueue()
        } else {
            ctx.reply(`Please wait in queue, ${queue.length - 1} more in line`)
        }
    }
})

async function processQueue() {
    if (queue.length === 0) {
        return
    }

    const ctx = queue[0]
    const linkFromTel = ctx.message.text
    ctx.reply(`link is in process`)
    console.time('text')

    const link = convertToDesktopUrl(linkFromTel)
    let dataFromPage
    try {
        dataFromPage = await scraping(link)
    } catch (e) {
        console.error(e)
    }

    // try two times more
    if (!dataFromPage.text) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
            dataFromPage = await scraping(link)
        } catch (e) {
            console.error(e)
        }
    }
    if (!dataFromPage.text) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
            dataFromPage = await scraping(link)
        } catch (e) {
            console.error(e)
            return
        }
    }

    const { text, author, title } = dataFromPage

    if(!text) {
        ctx.reply(`Sorry, I cann't find subtitles for the video`)
        queue.shift()
        processQueue()
    } else {
        // Inform the user that their link is being processed
        ctx.reply(`video you provided '${title}' by '${author}' is now being processed`)

        try {
            await handleText(text, false, link, title, author, ctx)
        } catch (err) {
            ctx.reply(`something went wrong, Marina needs to watch logs`)
            console.log('err')
        } finally {
            // Remove the processed request from the queue
            queue.shift()
            // Process the next request in the queue
            processQueue()
        }
    }
    console.timeEnd('text')
}

async function sendMessageToOtherChannel(bot, message) {
    const CHANNEL_ID = '-1002409262679'; // Укажите ваш chat_id или username канала
    try {
        await bot.telegram.sendMessage(CHANNEL_ID, message, { parse_mode: 'HTML' });
        console.log('Message sent to channel successfully');
    } catch (error) {
        console.error('Failed to send message to channel:', error);
    }
}

async function handleText(text, isSummary, link, title, author, ctx) {
    console.time('generate')
    const res = await generate(text, false, link, title, author, ctx)
    console.timeEnd('generate')
    console.log('ready: ' + res.notionLink)
    ctx.reply('Here is notion link: ' + res.notionLink)

    const channelMessage = `заголовок ${title}\n автор: ${author}\n ссылка: ${link}\n\n${res.notionLink} `;
    await sendMessageToOtherChannel(bot, channelMessage);

    // Create a temporary file from the result
    const filePath = path.join(__dirname, 'result.txt');
    const content = typeof res.result === 'string' ? res.result : JSON.stringify(res.result, null, 2);
    fs.writeFileSync(filePath, content, { encoding: 'utf8' });

    // Send the file to the user
    await ctx.telegram.sendDocument(ctx.chat.id, {
        source: filePath,
        filename: 'result.txt'
    });

    // Remove the temporary file
    fs.unlinkSync(filePath);
}


function isValidYouTubeLink(link) {
    try {
        const parsedUrl = new URL(link);
        const hostname = parsedUrl.hostname;
        const searchParams = parsedUrl.searchParams;

        if ((hostname === 'www.youtube.com' || hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'youtu.be') &&
            (searchParams.get('v') || hostname === 'youtu.be')) {
            return true;
        }
    } catch (error) {
        return false;
    }
    return false;
}

function convertToDesktopUrl(url) {
    const mobileUrlRegex = /^https?:\/\/m\.youtube\.com\/watch\?v=(.*)$/;
    const sharingUrlRegex = /^https?:\/\/youtu\.be\/(.*)$/;

    let desktopUrl = url;

    if (mobileUrlRegex.test(url)) {
        desktopUrl = url.replace(mobileUrlRegex, 'https://youtube.com/watch?v=$1');
    } else if (sharingUrlRegex.test(url)) {
        desktopUrl = url.replace(sharingUrlRegex, 'https://youtube.com/watch?v=$1');
    }

    return desktopUrl;
}

bot.launch() // запуск бота
bot.telegram.deleteWebhook().then(() => {
    console.log('Previous webhook deleted');
}).catch((err) => {
    console.error('Failed to delete webhook:', err);
});
app.use(bot.webhookCallback('/telegram'));
const WEBHOOK_URL = `${process.env.APP_URL}/telegram`;
bot.telegram.setWebhook(WEBHOOK_URL);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
