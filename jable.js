const fs = require('fs');
const URL = require('url');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const { Parser } = require('m3u8-parser');

(async () => {
    const test = new Jable('ABP-583 女子經理人是我們的性處理寵物。 024 愛音麻里亞', 'https://jable.tv/videos/abp-583/',
        'https://q-tom-am.alonestreaming.com/hls/wW2jc8g73cTs9o4Fp51mJg/1623353570/1000/1648/1648.m3u8');
    await test.start();
})().catch(err => console.log(err));

function headers(authority, main_url) {
    return {
        headers: (authority && main_url) ? {
            'authority': authority,
            'pragma': 'no-cache',
            'cache-control': 'no-cache',
            'origin': 'https://jable.tv',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X -1_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36',
            'accept': '*/*',
            'sec-fetch-site': 'cross-site',
            'sec-fetch-mode': 'cors',
            'referer': main_url,
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7,zh-TW;q=0.6',
        } : {
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X -1_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36'
        }
    };
}

function Jable(name, main_url, m3u8_url) {
    this.name = name;
    this.id = name.split(' ')[0];
    this.main_url = main_url;
    this.m3u8_url = m3u8_url;
    that = this;
    this.init = () => {
        that.dir = path.join(__dirname, that.id);
        if (!fs.existsSync(that.dir)) { fs.mkdirSync(that.dir); }
        that.parser = new Parser();
        that.authority = URL.parse(m3u8_url).host;
        that.prefix = path.dirname(m3u8_url) + '/';
    }
    this.dlM3u8 = async () => {
        m3u8_file = that.id + '.m3u8';
        m3u8_path = path.join(that.dir, m3u8_file);
        if (!fs.existsSync(m3u8_path)) {
            console.log(`fetch: ${that.m3u8_url} => ${m3u8_path}`);
            // await fetch(that.m3u8_url, headers()).then(res => res.body.pipe(fs.createWriteStream(m3u8_path)));
            await fetch(that.m3u8_url, headers()).then(res => res.buffer()).then(buff => fs.writeFileSync(m3u8_path, buff, 'binary'));
        }
        that.parser.push(fs.readFileSync(m3u8_path));
        that.parser.end();
        // let duration = 0;
        // that.parser.manifest.segments.forEach(segment => {
        //     duration += segment.duration;
        // });
        // console.log(`有 ${that.parser.manifest.segments.length} 个片段，时长：${formatTime(duration)}`);
    }
    this.dlKey = async (segment) => {
        let key_url = that.prefix + segment.key.uri;
        let aes_path = path.join(that.dir, 'aes.key');
        if (!that.key) {
            if (!fs.existsSync(aes_path)) {
                console.log(`fetch: ${key_url} => ${aes_path}`);
                // await fetch(key_url, headers()).then(res => res.body.pipe(fs.createWriteStream(aes_path));
                await fetch(key_url, headers()).then(res => res.buffer()).then(buff => fs.writeFileSync(aes_path, buff, 'binary'));
            }
            that.key = fs.readFileSync(aes_path);
            if (that.key.length == 32) {
                that.key = Buffer.from(fs.readFileSync(aes_path, { encoding: 'utf8' }), 'hex');
            }
        }
        return that.key;
    }
    this.dlTs = async (i) => {
        let segment = that.parser.manifest.segments[i];

        let key = await that.dlKey(segment);
        if (!key) { throw new Error('key error'); }

        let uri_ts = that.prefix + segment.uri;
        let filename = path.basename(uri_ts, '.ts');
        let filpath_dl = path.join(that.dir, filename + '.dl');
        let filpath_ts = path.join(that.dir, ('00000' + i).slice(-1 * (that.parser.manifest.segments.length.toString().length)) + '.ts');
        if (!fs.existsSync(filpath_ts)) {
            if (!fs.existsSync(filpath_dl)) {
                console.log(`fetch: [${i}] ${uri_ts} => ${filpath_dl}`);
                // await fetch(uri_ts, headers(that.authority, that.main_url)).then(res => res.body.pipe(fs.createWriteStream(filpath_dl)));
                await fetch(uri_ts, headers(that.authority, that.main_url)).then(res => {
                    if (res.status !== 200) { throw new Error(`HTTP ${res.status} ${res.statusText}`) }
                    return res.buffer()
                }).then(buff => fs.writeFileSync(filpath_dl, buff, 'binary'));
            }
            if (!fs.existsSync(filpath_dl)) { throw new Error('dl error'); }

            await that.decrypt(key, segment, filpath_dl, filpath_ts);
        }
    }
    this.decrypt = async (key, segment, src, dst) => {
        console.log(`decrypt: ${src} => ${dst}`);
        let iv = segment.key.iv != null ? Buffer.from(segment.key.iv.buffer) : Buffer.from(i.toString(16).padStart(32, '0'), 'hex');
        if (!iv) { throw new Error('iv error'); }

        let cipher = crypto.createDecipheriv((segment.key.method + "-cbc").toLowerCase(), key, iv);
        cipher.on('error', console.error);
        let inputData = fs.readFileSync(src);
        let outputData = Buffer.concat([cipher.update(inputData), cipher.final()]);
        fs.writeFileSync(dst, outputData);
        fs.unlinkSync(src);
        return;
    }
    this.start = async () => {
        await that.dlM3u8();
        for (let i = 0; i < that.parser.manifest.segments.length; i++) {
            await that.dlTs(i);
        }
        await that.merge();
    }
    this.merge = async () => {
        console.log(`${that.name}.mp4`);
    }
    this.init();
    return this;
}