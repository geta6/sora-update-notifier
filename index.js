const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

require('dotenv').config();

if (typeof process.env.SLACK_TOKEN === 'undefined') {
  throw new Error('Missing required env "SLACK_TOKEN", you can use ".env".');
}

if (typeof process.env.SLACK_CHANNEL === 'undefined') {
  throw new Error('Missing required env "SLACK_CHANNEL", you can use ".env".');
}

(async function main() {
  let updated = false;
  const cache = require('./cache.json');
  const releases = { sora: [], sorajs: [] };

  { // Sora
    const $ = cheerio.load((await axios.get('https://sora.shiguredo.jp/doc/RELEASE_NOTE.html')).data);
    let finished = false;
    $('.rst-content .document > div > .section > .section').each(function(i, el) {
      if (finished) return;
      const title = $(el).find('h2').text().replace(/¶/g, '').trim();
      finished = (title === cache.sora);
      if (!finished) {
        const notes = $(el).find('.docutils').text().split('\n').filter((v) => !!v).join('\n');
        const section = [];
        $(el).find('.section').each(function(i, sec) {
          const sectionTitle = $(sec).find('h3').text().replace(/¶/g, '').trim();
          const sectionNotes = $(sec).find('.simple').text().trim().split('\n').filter((v) => !!v).join('\n').replace(/¶/g, '').trim();
          section.push({ title: sectionTitle, notes: sectionNotes })
        });
        releases.sora.push({ title, notes, section });
      }
    });
  }

  { // Sora JS
    const $ = cheerio.load((await axios.get('https://sora.shiguredo.jp/js-sdk-doc/release.html')).data);
    let finished = false;
    $('.rst-content .document > div > .section > .section').each(function(i, el) {
      if (finished) return;
      const title = $(el).find('h2').text().replace(/¶/g, '').trim();
      finished = (title === cache.sorajs);
      if (!finished) {
        const notes = $(el).find('.docutils').text().split('\n').filter((v) => !!v).join('\n');
        const section = [{
          title: $(el).find('.docutils .field').text().trim(),
          notes: $(el).find('.simple').text().trim(),
        }];
        releases.sorajs.push({ title, notes, section });
      }
    });
  }

  if (releases.sora.length > 0) {
    cache.sora = releases.sora[0].title;

    for (const release of releases.sora) {
      axios.post(`https://hooks.slack.com/services/${process.env.SLACK_TOKEN}`, JSON.stringify({
        channel: `#${process.env.SLACK_CHANNEL}`,
        attachments: [{
          fallback: `Sora v${release.title} released`,
          text: `<https://sora.shiguredo.jp/doc/RELEASE_NOTE.html|Sora v${release.title} released>`,
          color: '#95D8EB',
          fields: release.section.filter((section) => section.notes.split('\n').length < 10).map((section) => ({
            title: section.title,
            value: section.notes,
          })),
        }],
      }));
    }
  }

  if (releases.sorajs.length > 0) {
    cache.sorajs = releases.sorajs[0].title;

    for (const release of releases.sorajs) {
      axios.post(`https://hooks.slack.com/services/${process.env.SLACK_TOKEN}`, JSON.stringify({
        channel: `#${process.env.SLACK_CHANNEL}`,
        attachments: [{
          fallback: `Sora JavaScript SDK v${release.title} released`,
          text: `<https://sora.shiguredo.jp/js-sdk-doc/release.html|Sora JavaScript SDK v${release.title} released>`,
          color: '#95D8EB',
          fields: release.section.filter((section) => section.notes.split('\n').length < 10).map((section) => ({
            title: section.title,
            value: section.notes,
          })),
        }],
      }));
    }
  }

  if (releases.sora.length > 0 || releases.sorajs.length > 0) {
    await new Promise((resolve, reject) => fs.writeFile(path.join(__dirname, 'cache.json'), JSON.stringify(cache), 'utf-8', (err) => err ? reject(err) : resolve()));
  }
}());

