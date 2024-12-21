const axios = require('axios');
const langdetect = require('langdetect');
const { Configuration, OpenAIApi } = require('openai');
const { sendResultToNotion } = require('./send-to-notion')

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
// const openai = new OpenAIApi(configuration);

const OPENAI_API_KEY = `Bearer ${process.env.OPENAI_API_KEY}`
console.log('!!!!!OPENAI_API_KEY', OPENAI_API_KEY)

const config = {
    headers: {
        'Content-Type': 'application/json',
        'Authorization': OPENAI_API_KEY
    }
};

async function handleChunks(chunks, isSummary) {
    try {
        const result = [];
        let currentTail = '';
        for (let i = 0; i < chunks.length; i++) {
            console.time('chunk')
            console.log('currentTail length', currentTail.length)
            console.log('chunks - [', i, '] ',chunks[i].length)
            const currentChunk = `${currentTail}${chunks[i]}`;
            const resultFromAI = await setRequest(currentChunk, isSummary);
            if(resultFromAI) {
                console.log('piece N', i, 'currentChunk.length - ', currentChunk.length, 'resultFromAI.length- ', resultFromAI?.completeText?.length)
                console.log('resultFromAI.tail', resultFromAI.tail)
                result.push(resultFromAI.completeText);
                console.log('!!!result when i=', i)
                result.forEach((item, index) => {
                    console.log('N', i)
                    console.log('*****', item)
                })
                currentTail = resultFromAI.tail;
                if (i === chunks.length -1) {
                    result.push(currentTail);
                }
                console.timeEnd('chunk')
            }
        }
        return result;
    } catch (error) {
        console.log(error);
    }
}

function findTail(text) {
    const endIndex = text.length-1
    let lastSentenceIndex = text.lastIndexOf('. ', endIndex);
    console.log('lastSentenceIndex', lastSentenceIndex)
    if (lastSentenceIndex === -1) {
        lastSentenceIndex = endIndex
    }
    const completeText = text.substring(0, lastSentenceIndex + 1);
    const  tail = text.substring(lastSentenceIndex + 1, endIndex);
    console.log('completeText', completeText.length)
    console.log('tail', tail.length)
    return {
        completeText, tail
    }
}

async function setRequest(text, isSummary) {
    const currentText = generatePrompt(text, isSummary)
    const data = {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: currentText }],
        temperature: 0.1,
    };
    console.log('set request')
    console.log('!!!!!config', config)
    try {
        // console.log('data', data, data.messages[0])
        return axios.post('https://api.openai.com/v1/chat/completions', data, config)
            .then((response) => {
                // const result = findTail(response.data.choices[0].message.content)
                // console.log('res', response.data.choices[0].message.content)
                const result = response.data.choices[0].message.content
                console.log('!!!!result', result)
                if (!result || result === '') {
                    console.log('!! result bug !!response.data', response.data)
                }
                return findTail(result)
            })
            .catch((error) => {
                console.log('error')
                console.log(JSON.stringify(error, null, 2));
                // console.log(error?.data?.error);
            });
    } catch(error) {
        console.log('!!!!error', error)
        // console.log(c)
    }
}

function getLanguage(text) {
    const textExample = text.length < 300 ? text : text.substring(0, 300)
    const languages = {
        'en': 'English',
        'de': 'German',
        'ru': 'Russian'
    }

    const detectedLang = langdetect.detect(textExample);
    if (detectedLang && detectedLang[0] && detectedLang[0].lang && languages[detectedLang[0].lang]) {
        return languages[detectedLang[0].lang]
    } else {
        return 'English'
    }
}


function generatePrompt(text, isSummary) {
    const lang = getLanguage(text)
    /*
    if (isSummary) {
      return `I give you text in ${lang}, this is a part of audio trancribing  please write me a summary in ${lang}, do not change sense, try to keep exapmles, is there some points include all of them, here is my text: ${text}`;
    }
     */
    return `I provide you with a text in ${lang}, which is part of an audio transcript. Your task is to transform this automated YouTube transcript into readable text: break it into meaningful sentences and paragraphs, apply correct punctuation, remove interjections or filler words, correct any misrecognized words, and format it as a dialogue if it’s an interview. Do not shorten the text, change its meaning, or add any new content; focus solely on improving readability. ${text}`;
}

function removeTimecodes(text) {
    const timecodePattern = /\d{1,2}:\d{2}/g;
    const withoutTimecodes = text.replace(timecodePattern, '');

    // Remove line breaks
    const lineBreakPattern = /\r?\n|\r/g;
    const withoutLineBreaks = withoutTimecodes.replace(lineBreakPattern, ' ');
    return withoutLineBreaks;
}

function splitIntoChunks(text) {
    const chunkSize = 10000;
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.substring(i, i + chunkSize));
    }
   return chunks;
}

function minutesToHandleText(numPieces) {
    const timePerPieceInSeconds = 50; // 1 min 30 sec per piece
    const totalSeconds = numPieces * timePerPieceInSeconds;
    const totalMinutes = Math.ceil(totalSeconds / 60);
    return totalMinutes;
}

exports.generate = async (text, isSummary, url, title, author, ctx) => {
    console.log('!!!generate , url, title', url, title, author)
    const originalText = text || ''
    // const isSummary = req.body.isSummary
    const clearText = removeTimecodes(originalText);
    const chunks  = splitIntoChunks(clearText)
    ctx.reply('I need about ' + minutesToHandleText(chunks.length) + ' min. to handle the video')

    try {
        console.log('total chunks - ', chunks.length)
        const resultFromAi = await handleChunks(chunks, isSummary)
        console.log('input length', text.length)
        if (resultFromAi) {
            console.log('output length', resultFromAi.join('').length)
            ctx.reply('input length --' + text.length)
            ctx.reply( 'output length - ' + resultFromAi.join('').length)
            try {
                const notionRes = await sendResultToNotion(title, resultFromAi.join(''), url)
                const notionLink = notionRes ? notionRes.url : ''
                return { result: resultFromAi.join(''), notionLink };
            } catch (err) {
                console.log(err)
                try {
                    const notionRes = await sendResultToNotion(title, resultFromAi.join(''), url, author)
                    const notionLink = notionRes.url
                    return { result: resultFromAi.join(''), notionLink };
                } catch (err) {
                    console.log(err)
                }
            }
        } else {
            console.log('no res')
        }
    } catch(error) {
        // Consider adjusting the error handling logic for your use case
        if (error.response) {
            console.error(error.response.status);
        } else {
            console.error(`Error with OpenAI API request: ${error.message}`);
        }
    }
}