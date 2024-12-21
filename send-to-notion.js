const { Client } = require('@notionhq/client');
const fs = require('fs');
const NOTION_KEY= process.env.NOTION_KEY
const notion = new Client({ auth: NOTION_KEY })

const databaseId = process.env.NOTION_DATABASE_ID

function splitLongParagraphs(text) {
  const paragraphs = text.split(/\n+/);
  const result = [];

  paragraphs.forEach((paragraph) => {
    if (paragraph.length <= 2000) {
      result.push(paragraph);
    } else {
      console.log('paragraph > 2000', paragraph, paragraph.length)
      const sentences = paragraph.split('.');
      console.log('sentences', sentences.length)
      let newParagraph = '';

      sentences.forEach((sentence, index) => {
        if (newParagraph.length + sentence.length + 1 <= 2000) {
          newParagraph += (index === 0 ? '' : '.') + sentence;
        } else {
          console.log('result.push(newParagraph)', newParagraph.length)
          result.push(newParagraph);
          newParagraph = sentence;
        }
      });

      if (newParagraph.length > 0 && newParagraph.length < 1900) {
        result.push(newParagraph);
      } else {
        console.log('else', newParagraph, newParagraph.length)
      }
    }
  });
  return result
}

function saveTextToFile(text) {
  fs.writeFile('text.txt', text, err => {
    if (err) {
      console.error('Error saving text to file:', err);
    } else {
      console.log('Text saved to file successfully.');
    }
  });
}

exports.sendResultToNotion = async (title, text, link, authorFromPage) => {
  console.log('!sendResultToNotion, title, link', title, link, authorFromPage)
  saveTextToFile(text);  // Save text to file before proceeding
  try {
    // Split the text into paragraphs
    let paragraphs = splitLongParagraphs(text);
    console.log('!!paragraphs',  paragraphs.length, paragraphs[0])
    if (paragraphs.length > 99) {
      paragraphs.length = 99
      console.log('!more than 100 paragraphs')
    }
    const newParagraphs = paragraphs.filter(item => {
      console.log('item.length', item.length, item.length < 2000)
      return item.length < 2000
    })
    const errors = paragraphs.filter(item => item.length > 2000)
    console.log('errors', errors)
    console.log('paragraphs', paragraphs)

    // Create an array of paragraph blocks
    const childrenBlocks = newParagraphs.map((paragraph) => {
      return {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: paragraph,
              },
            },
          ],
        },
      };
    });

    console.log('childrenBlocks', childrenBlocks);
    const currentDate = new Date().toISOString();
    const author = authorFromPage ? authorFromPage : 'test'


    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        title: {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        },
        link: {  // Add this property for the 'link' column
          url: link,
        }
      },
      children: childrenBlocks,
    });

    console.log(response);
    return response
  } catch (error) {
    console.error('error in notion', error)
  }
};