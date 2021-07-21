const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const { IMG_DIR, PAGES } = require('./conf');
const { DATA_FILE, getCache, fetchBody, fetchSave } = require('./comm');

(async () => {
    let data = {};
    if (fs.existsSync(DATA_FILE)) {
        let text = fs.readFileSync(DATA_FILE, 'utf-8');
        data = JSON.parse(text);
    }
    let i = 0;
    while (++i < PAGES) {
        // let $ = await getWeb(`https://jable.tv/categories/uncensored/${i}/`);
        let $ = await getWeb(`https://jable.tv/new-release/${i}/`);
        if ($) {
            $('.video-img-box').each(function () {
                console.log('Page', i, $(this).find('.detail a').text());
                data[$(this).find('.detail a').text().split(' ')[0]] = {
                    url: $(this).find('.cover-md a').attr('href'),
                    name: $(this).find('.detail a').text().replace(/\//g, '_'),
                    jpg: $(this).find('.cover-md img').attr('data-src'),
                    mp4: $(this).find('.cover-md img').attr('data-preview'),
                };
            });
        }
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    // for (let k in data) {
    //     let mm = data[k];
    //     let img_file = mm.name + path.extname(mm.jpg);
    //     let img_path = path.join(IMG_DIR, img_file);
    //     if (!fs.existsSync(img_path)) {
    //         await fetchSave(mm.jpg, img_path, true);
    //     }
    // }
})().catch(err => console.error(err));

async function getWeb(url) {
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
    return null;
}
