const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const Proxy = require('https-proxy-agent');

const dataFile = path.join(__dirname, 'new.json');
const cacheDir = path.join(__dirname, 'Cache');
const jpgDir = path.join(__dirname, 'Jpg');
const m3u8Dir = path.join(__dirname, 'M3u8');

(async () => {
    let mm = [];
    if (fs.existsSync(dataFile)) {
        let text = fs.readFileSync(dataFile, 'utf-8');
        mm = JSON.parse(text);
        let M = {};
        for (let i = 0; i < mm.length; i++) {
            let name = mm[i].title.split(' ')[0];
            M[name] = mm[i];
        }
        fs.writeFileSync(dataFile, JSON.stringify(M, null, 2));
    } else {
        let i = 0;
        while (++i < 436) {
            let $ = await getWeb(`https://jable.tv/new-release/${i}/`);
            $('.video-img-box').each(function() {
                console.log($(this).find('.detail a').text());
                mm.push({
                    title: $(this).find('.detail a').text(),
                    url: $(this).find('.cover-md a').attr('href'),
                    jpg: $(this).find('.cover-md img').attr('data-src'),
                    mp4: $(this).find('.cover-md img').attr('data-preview'),
                });
            });
        }
        for (let i = 0; i < mm.length; i++) {
            if (!mm[i].m3u8) {
                let url = mm[i].url;
                let $ = await getWeb(url);
                mm[i].m3u8 = $('link[rel="preload"]').attr('href');
                console.log(mm.length, i, mm[i].m3u8);
            }
        }
        fs.writeFileSync(dataFile, JSON.stringify(mm, null, 2));
    }
    for (let i = 0; i < mm.length; i++) {
        if (mm[i].m3u8) {
            console.log(mm.length, i);
            let name = mm[i].title.replaceAll('/', '_');
            let imgUrl = mm[i].jpg;
            let imgFile = path.join(jpgDir, name + path.extname(imgUrl));
            await getImg(imgUrl, imgFile);
            // let m3u8File = path.join(m3u8Dir, name + path.extname(mm[i].m3u8));
            // await getM3u8(mm[i].url, mm[i].m3u8, m3u8File);
        }
    }
})().catch(err => console.error(err));

async function getWeb(url) {
    let cache_url = url.split('://')[1].replaceAll('/', '_');
    let cache_file = path.join(cacheDir, cache_url);
    let body;
    if (fs.existsSync(cache_file)) {
        body = fs.readFileSync(cache_file);
    } else {
        console.debug('--->', url);
        body = await fetch(url, {
            agent: new Proxy('http://127.0.0.1:1087'),
            headers: {
                'accept-encoding': 'gzip, deflate, br',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_16_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36',
            },
        }).then(res => res.text());
    }
    if (body && body.length > 100) {
        if (url.indexOf('videos') !== -1) {
            fs.writeFileSync(cache_file, body);
        }
        return cheerio.load(body);
    }
}

async function getImg(url, dst) {
    if (fs.existsSync(dst)) {
        return;
    }
    await fetch(url, {
        agent: new Proxy('http://127.0.0.1:1087'),
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
    }).catch(err => console.error(err));
}

async function getM3u8(url, m3u8, dst) {
    if (fs.existsSync(dst)) {
        return;
    }
    await fetch(m3u8, {
        agent: new Proxy('http://127.0.0.1:1087'),
        headers: {
            'authority': 'gbb001.cdnlab.live',
            'pragma': 'no-cache',
            'cache-control': 'no-cache',
            'origin': 'https://jable.tv',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X -1_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36',
            'accept': '*/*',
            'sec-fetch-site': 'cross-site',
            'sec-fetch-mode': 'cors',
            'referer': 'https://jable.tv/videos/n0495/',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7,zh-TW;q=0.6',
        },
    }).then(res => {
        res.body.pipe(fs.createWriteStream(dst));
        console.log('saved', dst);
    }).catch(err => console.error(err));
}