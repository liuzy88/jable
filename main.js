const fs = require('fs');
const URL = require('url');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const Proxy = require('https-proxy-agent');
const { Parser } = require('m3u8-parser');
const { exec, spawn } = require('child_process');

const agent = new Proxy('http://127.0.0.1:1087');
const dataFile = path.join(__dirname, 'data.json');
const cacheDir = path.join(__dirname, '_Cache');

(async () => {
    // await new Jable('https://jable.tv/videos/fsdss-234/').start();
    let text = fs.readFileSync(dataFile, 'utf-8');
    var data = JSON.parse(text);
    for (let k in data) {
        await new Jable(data[k].url).start();
    }
})().catch(err => console.log(err));

function headers(authority, url) {
    return {
        headers: (authority && url) ? {
            'authority': authority,
            'pragma': 'no-cache',
            'cache-control': 'no-cache',
            'origin': 'https://jable.tv',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X -1_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36',
            'accept': '*/*',
            'sec-fetch-site': 'cross-site',
            'sec-fetch-mode': 'cors',
            'referer': url,
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7,zh-TW;q=0.6',
        } : {
            'accept-encoding': 'gzip, deflate, br',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X -1_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36'
        }
    };
}

async function sleep(n) {
    return new Promise((resolve, reject) => {
        setTimeout(function() {
            resolve(true);
        }, 1000 * n);
    });
}

async function download(that, download_url, save_path, retry) {
    while (retry-- > 0) {
        const res = await fetch(download_url, headers(that.authority, that.url));
        if (res.status === 401) {
            fs.unlinkSync(that.cache_file);
        }
        if (res.status === 200) {
            const buff = await res.buffer();
            fs.writeFileSync(save_path, buff, 'binary');
            break;
        } else {
            console.log(`download failed, ${retry} ${download_url} => ${res.status} ${res.statusText}`);
            if (fs.existsSync(save_path)) { fs.unlinkSync(save_path); }
            await sleep(1);
            await download(that, download_url, save_path, retry);
        }
    };
}

function Jable(url) {
    this.url = url;
    that = this;
    this.getWeb = async () => {
        let cache_name = url.split('://')[1].replaceAll('/', '_');
        that.cache_file = path.join(cacheDir, cache_name);
        let body;
        if (fs.existsSync(that.cache_file)) {
            console.log(`useCache: ${that.cache_file}`);
            body = fs.readFileSync(that.cache_file, 'utf-8');
        } else {
            console.log(`getWeb: ${this.url}`);
            body = await fetch(this.url, { agent: agent, headers: headers().headers }).then(res => res.text()).catch(err => console.error('getWeb', err));
            fs.writeFileSync(that.cache_file, body, 'utf-8');
        }
        that.m3u8_url = body.split("var hlsUrl = '")[1].split("';")[0];
        let $ = cheerio.load(body);
        that.name = $('h4').eq(0).text();
        that.id = that.name.split(' ')[0];
        that.dir = path.join(__dirname, that.id);
        if (!fs.existsSync(that.dir)) { fs.mkdirSync(that.dir); }
        let txt_name = `${that.id}.txt`;
        that.txt_path = path.join(that.dir, txt_name);
        let mp4_name = `${that.name}.mp4`;
        that.mp4_path = path.join(that.dir, mp4_name);
        console.log(`url=${that.url} id=${that.id} name=${that.name}`);
    }
    this.getM3u8 = async () => {
        that.authority = URL.parse(that.m3u8_url).host;
        that.prefix = path.dirname(that.m3u8_url) + '/';
        let m3u8_file = that.id + '.m3u8';
        let m3u8_path = path.join(that.dir, m3u8_file);
        if (!fs.existsSync(m3u8_path)) {
            console.log(`getM3u8: ${that.m3u8_url} => ${m3u8_path}`);
            await download(that, that.m3u8_url, m3u8_path, 3);
        }
        that.parser = new Parser();
        that.parser.push(fs.readFileSync(m3u8_path));
        that.parser.end();
        that.total = that.parser.manifest.segments.length;
    }
    this.getKey = async (segment) => {
        let key_url = that.prefix + segment.key.uri;
        let key_path = path.join(that.dir, that.id + '.key');
        if (!that.key) {
            if (!fs.existsSync(key_path)) {
                console.log(`getKey: ${key_url} => ${key_path}`);
                await fetch(key_url, headers()).then(res => res.buffer()).then(buff => fs.writeFileSync(key_path, buff, 'binary'));
            }
            that.key = fs.readFileSync(key_path);
            if (that.key.length == 32) {
                that.key = Buffer.from(fs.readFileSync(key_path, { encoding: 'utf8' }), 'hex');
            }
        }
        return that.key;
    }
    this.getTs = async (i) => {
        let segment = that.parser.manifest.segments[i];

        let key = await that.getKey(segment);
        if (!key) { throw new Error('key error'); }

        let ts_url = that.prefix + segment.uri;
        let dl_name = path.basename(ts_url, '.ts');
        let dl_path = path.join(that.dir, dl_name + '.dl');
        let ts_name = ('00000' + i).slice(-1 * (that.total.toString().length)) + '.ts';
        let ts_path = path.join(that.dir, ts_name);
        if (!fs.existsSync(ts_path)) {
            if (!fs.existsSync(dl_path)) {
                console.log(`getTs: [${i}/${that.total}] ${ts_url} => ${dl_path}`);
                await download(that, ts_url, dl_path, 3);
            }
            if (!fs.existsSync(dl_path)) { throw new Error('dl error'); }

            await that.decrypt(key, segment, dl_path, ts_path);
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
    this.merge = async () => {
        console.log(`merge: ${that.txt_path} => ${that.mp4_path}`);
        let data = [];
        for (let i = 0; i < that.total; i++) {
            let ts_name = ('00000' + i).slice(-1 * (that.total.toString().length)) + '.ts';
            data.push(`file '${ts_name}'`);
        }
        fs.writeFileSync(that.txt_path, data.join('\r\n'));
        let code = await new Promise((resolve, reject) => {
            const shell = spawn('ffmpeg', ['-f', 'concat', '-safe', '0', '-i', that.txt_path, '-c', 'copy', that.mp4_path]);
            console.log(shell.spawnargs.join(' '));
            shell.stdout.on('data', data => { console.log(data.toString().trim()); });
            shell.stderr.on('data', data => { console.error(data.toString().trim()); });
            shell.on('close', (code) => { resolve(code); });
        });
        if (code === 0 && fs.existsSync(that.mp4_path)) {
            for (let i = 0; i < that.total; i++) {
                let ts_name = ('00000' + i).slice(-1 * (that.total.toString().length)) + '.ts';
                fs.unlinkSync(path.join(that.dir, ts_name));
            }
        }
    }
    this.start = async () => {
        await that.getWeb();
        if (that.mp4_path && fs.existsSync(that.mp4_path)) { return; }
        await that.getM3u8();
        let thread = 8; // 并行下载数量
        let times = (that.total % thread) > 0 ? parseInt(that.total / thread) + 1 : (that.total / thread); // 要多少次
        for (let m = 0; m < times; m++) {
            let batch = []; // 一批次
            for (let n = 0; n < thread; n++) {
                let i = (m * thread) + n;
                if (i < that.total) { // 下标从0到总数减1
                    batch.push(that.getTs(i));
                }
            }
            await Promise.all(batch); // 等所有并行完成
        }
        await that.merge();
    }
    return this;
}