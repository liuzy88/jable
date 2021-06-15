const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const { Parser } = require('m3u8-parser');
const { spawn } = require('child_process');

const { TEMP_DIR, MP4_DIR, THREAD } = require('./conf');
const { DATA_FILE, getCache, mkdir, sleep, fetchBody, fetchSave } = require('./kit');

(async () => {
    if (fs.existsSync(DATA_FILE)) {
        let text = fs.readFileSync(DATA_FILE, 'utf-8');
        var data = JSON.parse(text);
        for (let k in data) {
            await new Jable(data[k].url, data[k].name).start();
        }
    } else {
        await new Jable('https://jable.tv/videos/dv-1303/', 'DV-1303 為隊員們處理性慾的超可愛棒球部經紀人 小島南').start();
    }
})().catch(err => console.error(err));

function Jable(url, name) {
    this.url = url;
    this.name = name.replace(/\//g, '_');
    this.id = this.name.split(' ')[0];
    this.dir = path.join(TEMP_DIR, this.id);
    mkdir(this.dir);
    let txt_file = `${this.id}.txt`;
    this.txt_path = path.join(this.dir, txt_file);
    let mp4_name = `${this.name}.mp4`;
    this.mp4_path = path.join(MP4_DIR, mp4_name);
    that = this;
    this.fetchWeb = async () => {
        that.cache_path = getCache(that.url);
        let body;
        if (fs.existsSync(that.cache_path)) {
            console.log(`useCache: ${that.cache_path}`);
            body = fs.readFileSync(that.cache_path, 'utf-8');
        } else {
            console.log(`fetchWeb: ${that.url}`);
            body = await fetchBody(that.url, true);
            fs.writeFileSync(that.cache_path, body);
        }
        that.m3u8_url = body.split("var hlsUrl = '")[1].split("';")[0];
        if (!that.name) {
            let $ = cheerio.load(body);
            that.name = $('h4').eq(0).text().replace(/\//g, '_');
        }
    }
    this.fetchM3u8 = async () => {
        that.authority = URL.parse(that.m3u8_url).host;
        that.prefix = path.dirname(that.m3u8_url) + '/';
        let m3u8_file = that.id + '.m3u8';
        let m3u8_path = path.join(that.dir, m3u8_file);
        if (!fs.existsSync(m3u8_path)) {
            console.log(`fetchM3u8: ${that.m3u8_url} => ${m3u8_path}`);
            let status = await fetchSave(that.m3u8_url, m3u8_path, false, that.authority, that.url);
            if (status === 401) {
                fs.unlinkSync(that.cache_path);
            }
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
                let status = await fetchSave(key_url, that.key_path, false, that.authority, that.url);
                if (status === 401) {
                    fs.unlinkSync(that.cache_path);
                }
            }
            that.key = fs.readFileSync(that.key_path);
            if (that.key.length === 32) {
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
                await fetchSave(ts_url, options(that.authority, that.url), dl_path);
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
        const works = [];
        for (let i = 1; i <= THREAD; i++) {
            works.push(i);
        }
        return new Promise((resolve, reject) => {
            for (let i = 0; i < THREAD; i++) {
                (async () => {
                    while (true) {
                        const task = tasks.shift();
                        // console.log(`task #${task}, works.length=${works.length}`);
                        if (task === undefined && works.length === THREAD) { // 没有任务了 且 工人都在休息
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
