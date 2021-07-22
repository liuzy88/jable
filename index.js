const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const DB = require('./db');

const { IMG_DIR, PAGES } = require('./conf');
const { getCache, fetchBody, fetchSave } = require('./comm');

(async () => {
    await DB.init();
    for (let i = 1; i < 17; i++) {
        await scan(`https://jable.tv/categories/uncensored/`, i);
    }
    for (let i = 1; i < PAGES; i++) {
        await scan(`https://jable.tv/new-release/`, i);
    }
})().catch(err => console.error(err));

async function scan(url, i) {
    const $ = await fetchWeb(url + i + '/');
    if ($) {
        const array = [];
        $('.video-img-box').each(function() {
            let name = $(this).find('.detail a').text();
            if (name.startsWith('[廣告] ')) {
                name = name.substr(5);
            }
            let url = $(this).find('.cover-md a').attr('href');
            array.push({
                id: url.substring(24, url.length - 1),
                url: url,
                name: name.replace(/\//g, '_'),
                jpg: $(this).find('.cover-md img').attr('data-src'),
                mp4: $(this).find('.cover-md img').attr('data-preview'),
            });
        });
        for (let j = 0; j < array.length; j++) {
            const obj = array[j];
            console.log('Page', i, obj.name);
            const m = await DB.Model.findByPk(obj.id);
            if (m == null) {
                DB.Model.create(obj);
            }
        }
    }
}

async function fetchWeb(url) {
    let cache_path = getCache(url);
    let body;
    if (fs.existsSync(cache_path)) {
        let stat = fs.statSync(cache_path);
        if ((Date.now() - stat.atimeMs) < (1000 * 60 * 60 * 8)) { // 使用8小时之内的缓存
            body = fs.readFileSync(cache_path);
            return cheerio.load(body);
        } else {
            fs.unlinkSync(cache_path);
        }
    }
    body = await fetchBody(url, true);
    if (body && body.length > 100) {
        fs.writeFileSync(cache_path, body);
        return cheerio.load(body);
    }
}

async function poster() {
    for (let k in data) {
        let mm = data[k];
        let img_file = mm.name + path.extname(mm.jpg);
        let img_path = path.join(IMG_DIR, img_file);
        if (!fs.existsSync(img_path)) {
            await fetchSave(mm.jpg, img_path, true);
        }
    }
}