const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const Proxy = require('https-proxy-agent');

const agent = new Proxy('http://127.0.0.1:1087');
const dataFile = path.join(__dirname, 'data.json');
const cacheDir = path.join(__dirname, '_Cache');
const jpgDir = path.join(__dirname, '_Jpg');
if (!fs.existsSync(cacheDir)) { fs.mkdirSync(cacheDir); }
if (!fs.existsSync(jpgDir)) { fs.mkdirSync(jpgDir); }

(async () => {
    var data = {};
    if (fs.existsSync(dataFile)) {
        let text = fs.readFileSync(dataFile, 'utf-8');
        data = JSON.parse(text);
    }
    let i = 0;
    while (++i < 500) { // 第一次500，以后10
        let $ = await getWeb(`https://jable.tv/new-release/${i}/`);
        if ($ == null) { continue; }
        $('.video-img-box').each(function() {
            console.log('Page', i, $(this).find('.detail a').text());
            data[$(this).find('.detail a').text().split(' ')[0]] = {
                url: $(this).find('.cover-md a').attr('href'),
                name: $(this).find('.detail a').text(),
                jpg: $(this).find('.cover-md img').attr('data-src'),
                mp4: $(this).find('.cover-md img').attr('data-preview'),
            };
        });
    }
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    for (let k in data) {
        let mm = data[k];
        let name = mm.name.replaceAll('/', '_');
        let imgFile = path.join(jpgDir, name + path.extname(mm.jpg));
        await getImg(mm.jpg, imgFile);
    }
    require('./main');
})().catch(err => console.error(err));

async function getWeb(url) {
    let cache_name = url.split('://')[1].replaceAll('/', '_');
    let cache_file = path.join(cacheDir, cache_name);
    let body;
    let useCache = false;
    if (fs.existsSync(cache_file)) {
        if (url.indexOf('videos') !== -1) { // 始终使用详情页缓存
            useCache = true;
        } else {
            let stat = fs.statSync(cache_file);
            if ((Date.now() - stat.atimeMs) < (1000 * 60 * 60 * 8)) { // 使用8小时之内的缓存
                useCache = true;
            } else {
                fs.unlinkSync(cache_file);
            }
        }
    }
    if (useCache) {
        body = fs.readFileSync(cache_file);
    } else {
        console.debug('Fetch', url);
        body = await fetch(url, {
            agent: agent,
            headers: {
                'accept-encoding': 'gzip, deflate, br',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_16_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36',
            },
        }).then(res => res.text()).catch(err => console.error('getWeb', err));
    }
    if (body && body.length > 100) {
        fs.writeFileSync(cache_file, body);
        return cheerio.load(body);
    }
    return null;
}

async function getImg(url, dst) {
    if (fs.existsSync(dst)) {
        return;
    }
    await fetch(url, {
        // agent: agent,
        headers: {
            'accept-encoding': 'gzip, deflate, br',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_16_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36',
        },
    }).then(res => {
        if (res.headers.get('content-type') === 'text/html') {
            console.error('下载失败，返回的是text/html', url);
        } else {
            res.body.pipe(fs.createWriteStream(dst));
            console.log('saved', dst);
        }
    }).catch(err => console.error('getImg', err));
}