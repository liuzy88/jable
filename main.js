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
    if (fs.existsSync(dataFile)) {
        let text = fs.readFileSync(dataFile, 'utf-8');
        var data = JSON.parse(text);
        for (let k in data) {
            await new Jable(data[k].url, data[k].name).start();
        }
    } else {
        await new Jable('https://jable.tv/videos/dv-1303/', 'DV-1303 為隊員們處理性慾的超可愛棒球部經紀人 小島南').start();
    }
})().catch(err => console.err(err));

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
        }, n);
    });
}

async function download(that, download_url, save_path, trys) {
    if (trys >= 10) {
        console.log(`download: error, now trys is ${trys} ${download_url}`);
        return;
    }
    trys = trys || 1;
    const res = await fetch(download_url, headers(that.authority, that.url));
    if (res.status === 200) {
        console.log(`download: ${trys} success, ${download_url} => ${res.status} ${res.statusText}`);
        const buff = await res.buffer();
        fs.writeFileSync(save_path, buff, 'binary');
    } else {
        console.log(`download: ${trys} failed, ${download_url} => ${res.status} ${res.statusText}`);
        if (res.status === 401) {
            fs.unlinkSync(that.cache_file);
        }
        if (fs.existsSync(save_path)) {
            fs.unlinkSync(save_path);
        }
        await sleep(1000); // 一秒后重试
        await download(that, download_url, save_path, ++trys);
    }
}

function Jable(url, name) {
    this.url = url;
    this.name = name;
    this.id = this.name.split(' ')[0];
    this.dir = path.join(__dirname, this.id);
    if (!fs.existsSync(this.dir)) { fs.mkdirSync(this.dir); }
    let txt_file = `${this.id}.txt`;
    this.txt_path = path.join(this.dir, txt_file);
    let mp4_name = `${this.name}.mp4`;
    this.mp4_path = path.join(this.dir, mp4_name);
    that = this;
    this.fetchWeb = async () => {
        let cache_name = that.url.split('://')[1].replaceAll('/', '_');
        that.cache_file = path.join(cacheDir, cache_name);
        let body;
        if (fs.existsSync(that.cache_file)) {
            console.log(`useCache: ${that.cache_file}`);
            body = fs.readFileSync(that.cache_file, 'utf-8');
        } else {
            console.log(`fetchWeb: ${that.url}`);
            body = await fetch(that.url, { agent: agent, headers: headers().headers }).then(res => res.text()).catch(err => console.error('fetchWeb', err));
            fs.writeFileSync(that.cache_file, body, 'utf-8');
        }
        that.m3u8_url = body.split("var hlsUrl = '")[1].split("';")[0];
        if (!that.name) {
            let $ = cheerio.load(body);
            that.name = $('h4').eq(0).text();
        }
    }
    this.fetchM3u8 = async () => {
        that.authority = URL.parse(that.m3u8_url).host;
        that.prefix = path.dirname(that.m3u8_url) + '/';
        let m3u8_file = that.id + '.m3u8';
        let m3u8_path = path.join(that.dir, m3u8_file);
        if (!fs.existsSync(m3u8_path)) {
            console.log(`fetchM3u8: ${that.m3u8_url} => ${m3u8_path}`);
            await download(that, that.m3u8_url, m3u8_path);
        }
        that.parser = new Parser();
        that.parser.push(fs.readFileSync(m3u8_path));
        that.parser.end();
        that.total = that.parser.manifest.segments.length;
    }
    this.fetchKey = async (segment) => {
        let key_url = that.prefix + segment.key.uri;
        that.key_path = path.join(that.dir, that.id + '.key');
        if (!that.key) {
            if (!fs.existsSync(that.key_path)) {
                console.log(`fetchKey: ${key_url} => ${that.key_path}`);
                // await fetch(key_url, headers()).then(res => res.buffer()).then(buff => fs.writeFileSync(that.key_path, buff, 'binary'));
                await download(that, key_url, that.key_path);
            }
            that.key = fs.readFileSync(that.key_path);
            if (that.key.length == 32) {
                that.key = Buffer.from(fs.readFileSync(that.key_path, { encoding: 'utf8' }), 'hex');
            }
        }
        return that.key;
    }
    this.fetchTs = async (i) => {
        let segment = that.parser.manifest.segments[i];

        let ts_url = that.prefix + segment.uri;
        let dl_name = path.basename(ts_url, '.ts');
        let dl_path = path.join(that.dir, dl_name + '.dl');
        let ts_name = ('00000' + i).slice(-1 * (that.total.toString().length)) + '.ts';
        let ts_path = path.join(that.dir, ts_name);
        if (!fs.existsSync(ts_path)) {
            if (!fs.existsSync(dl_path)) {
                console.log(`fetchTs: [${i}/${that.total}] ${ts_url} => ${dl_path}`);
                await download(that, ts_url, dl_path);
            }
            if (!fs.existsSync(dl_path)) { throw new Error('fetchTs error'); }

            let key = await that.fetchKey(segment);
            if (!key) { throw new Error('fetchKey error'); }

            await that.decrypt(key, segment, dl_path, ts_path);
        }
    }
    this.decrypt = async (key, segment, src, dst) => {
        console.log(`decrypt: ${src} => ${dst}`);
        let iv = segment.key.iv != null ? Buffer.from(segment.key.iv.buffer) : Buffer.from(i.toString(16).padStart(32, '0'), 'hex');
        if (!iv) { throw new Error('iv error'); }

        let cipher = crypto.createDecipheriv((segment.key.method + "-cbc").toLowerCase(), key, iv);
        cipher.on('error', err => console.error(err));
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
            shell.stdout.on('data', data => console.log(data.toString().trim()));
            shell.stderr.on('data', data => console.error(data.toString().trim()));
            shell.on('close', code => resolve(code));
        });
        if (code === 0 && fs.existsSync(that.mp4_path)) {
            for (let i = 0; i < that.total; i++) {
                let ts_name = ('00000' + i).slice(-1 * (that.total.toString().length)) + '.ts';
                fs.unlinkSync(path.join(that.dir, ts_name));
            }
        }
    }
    this.fetchAllTs = async () => {
        const tasks = [];
        for (let i = 0; i < that.total; i++) {
            tasks.push(i);
        }
        let thread = 16; // 并行下载数量
        const works = [];
        for (let i = 1; i <= thread; i++) {
            works.push(i);
        }
        return new Promise((resolve, reject) => {
            for (let i = 0; i < thread; i++) {
                (async () => {
                    while (true) {
                        const task = tasks.shift();
                        // console.log(`task #${task}, works.length=${works.length}`);
                        if (task === undefined && works.length == thread) { // 没有任务了 且 工人都在休息
                            resolve(true);
                            break;
                        }
                        if (task !== undefined) {
                            // console.log(`got task #${task}, more ${tasks.length} count.`);
                            const work = works.shift();
                            if (work) {
                                // console.log(`work #${work} begin task #${task}`);
                                await that.fetchTs(task);
                                // console.log(`work #${work} end task #${task}`);
                                works.push(work);
                            } else {
                                tasks.push(task);
                            }
                        }
                        await sleep(50);
                    }
                })();
            }
        });
    }
    this.start = async () => {
        if (that.mp4_path && fs.existsSync(that.mp4_path)) {
            console.log(that.mp4_path);
            return;
        }
        console.log(`start: url=${this.url} id=${this.id} name=${this.name}`);
        await that.fetchWeb();
        await that.fetchM3u8();
        await that.fetchAllTs();
        await that.merge();
    }
    return this;
}