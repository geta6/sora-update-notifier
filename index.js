#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const cloneDeep = require('lodash/cloneDeep');
const isEqual = require('lodash/isEqual');
const log = require('fancy-log');
const colors = require('ansi-colors');
const axios = require('axios');
const cheerio = require('cheerio');

require('dotenv').config();

function validate() {
  let correct = true;
  if (typeof process.env.SLACK_TOKEN === 'undefined') {
    log(colors.red('Missing required env "SLACK_TOKEN", you can use ".env".'));
    correct = false;
  }
  if (typeof process.env.SLACK_CHANNEL === 'undefined') {
    log(colors.red('Missing required env "SLACK_CHANNEL", you can use ".env".'));
    correct = false;
  }
};

(async function main() {
  let updated = false;
  let cache;
  try {
    cache = require('./tmp/cache.json');
  } catch(e) {
    cache = {};
  }

  const prevCache = cloneDeep(cache);
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

    if (validate()) {
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
  }

  if (releases.sorajs.length > 0) {
    cache.sorajs = releases.sorajs[0].title;

    if (validate()) {
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
  }

  if (!isEqual(cache, prevCache)) {
    for (const name of Object.keys(cache)) {
      log(`${name} updated: ${cache[name]}`);
    }
  } else {
    log('There is no update.');
  }

  if (releases.sora.length > 0 || releases.sorajs.length > 0) {
    await new Promise((resolve, reject) => {
      fs.writeFile('./tmp/cache.json', JSON.stringify(cache), 'utf-8', (err) => {
        err ? reject(err) : resolve();
      });
    });
  }
}());

