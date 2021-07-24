const fs = require('fs');
const URL = require('url');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');
const { Parser } = require('m3u8-parser');
const { spawn } = require('child_process');

const { TMP_DIR, MP4_DIR, THREAD } = require('./conf');
const { getCache, mkdir, sleep, fetchBody, fetchSave } = require('./comm');

module.exports = function Jable(url, name) {
    this.url = url;
    this.existsMp4 = () => {
        return (this.mp4_path && fs.existsSync(this.mp4_path)) || (this.mp4_path2 && fs.existsSync(this.mp4_path2));
    }
    this.init = (name) => {
        if (!name) { return; }
        this.name = name.replace(/\//g, '_');
        this.id = this.name.split(' ')[0];
        this.dir = path.join(TMP_DIR, this.id);
        mkdir(this.dir);
        let txt_file = `${this.id}.txt`;
        this.txt_path = path.join(this.dir, txt_file);
        let mp4_name = `${this.name}.mp4`;
        let mp4_name2 = `${this.id}.mp4`;
        this.mp4_path = path.join(MP4_DIR, mp4_name);
        this.mp4_path2 = path.join(MP4_DIR, mp4_name2);
    }
    this.fetchWeb = async () => {
        this.cache_path = getCache(this.url);
        let body;
        if (fs.existsSync(this.cache_path)) {
            console.log(`useCache: ${this.cache_path}`);
            body = fs.readFileSync(this.cache_path, 'utf-8');
        } else {
            console.log(`fetchWeb: ${this.url}`);
            body = await fetchBody(this.url, true);
            fs.writeFileSync(this.cache_path, body);
        }
        this.m3u8_url = body.split("var hlsUrl = '")[1].split("';")[0];
        if (!this.name) {
            let $ = cheerio.load(body);
            this.init($('h4').eq(0).text());
        }
    }
    this.fetchM3u8 = async () => {
        this.authority = URL.parse(this.m3u8_url).host;
        this.prefix = path.dirname(this.m3u8_url) + '/';
        let m3u8_file = this.id + '.m3u8';
        let m3u8_path = path.join(this.dir, m3u8_file);
        if (!fs.existsSync(m3u8_path)) {
            console.log(`fetchM3u8: ${this.m3u8_url} => ${m3u8_path}`);
            let status = await fetchSave(this.m3u8_url, m3u8_path, false, this.authority, this.url);
            if (status === 401) {
                fs.unlinkSync(this.cache_path);
            }
        }
        this.parser = new Parser();
        this.parser.push(fs.readFileSync(m3u8_path));
        this.parser.end();
        this.total = this.parser.manifest.segments.length;
    }
    this.fetchKey = async (segment) => {
        let key_url = this.prefix + segment.key.uri;
        this.key_path = path.join(this.dir, this.id + '.key');
        if (!this.key) {
            if (!fs.existsSync(this.key_path)) {
                console.log(`fetchKey: ${key_url} => ${this.key_path}`);
                let status = await fetchSave(key_url, this.key_path, false, this.authority, this.url);
                if (status === 401) {
                    fs.unlinkSync(this.cache_path);
                }
            }
            this.key = fs.readFileSync(this.key_path);
            if (this.key.length === 32) {
                this.key = Buffer.from(fs.readFileSync(this.key_path, { encoding: 'utf8' }), 'hex');
            }
        }
        return this.key;
    }
    this.fetchTs = async (i) => {
        let segment = this.parser.manifest.segments[i];

        let ts_url = this.prefix + segment.uri;
        let dl_name = path.basename(ts_url, '.ts');
        let dl_path = path.join(this.dir, dl_name + '.dl');
        let ts_name = ('00000' + i).slice(-1 * (this.total.toString().length)) + '.ts';
        let ts_path = path.join(this.dir, ts_name);
        if (!fs.existsSync(ts_path)) {
            if (!fs.existsSync(dl_path)) {
                console.log(`fetchTs: [${i}/${this.total}] ${ts_url} => ${dl_path}`);
                await fetchSave(ts_url, dl_path, false, this.authority, this.url);
            }
            if (!fs.existsSync(dl_path)) { throw new Error('fetchTs error'); }

            let key = await this.fetchKey(segment);
            if (!key) { throw new Error('fetchKey error'); }

            await this.decrypt(key, segment, dl_path, ts_path);
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
        console.log(`merge: ${this.txt_path} => ${this.mp4_path}`);
        let data = [];
        for (let i = 0; i < this.total; i++) {
            let ts_name = ('00000' + i).slice(-1 * (this.total.toString().length)) + '.ts';
            data.push(`file '${ts_name}'`);
        }
        fs.writeFileSync(this.txt_path, data.join('\r\n'));
        // ffmpeg -f concat -safe 0 -i n0594.txt -c copy n0594.mp4
        let code = await new Promise((resolve, reject) => {
            const shell = spawn('ffmpeg', ['-f', 'concat', '-safe', '0', '-i', this.txt_path, '-c', 'copy', this.mp4_path]);
            console.log(shell.spawnargs.join(' '));
            shell.stdout.on('data', data => console.log(data.toString().trim()));
            shell.stderr.on('data', data => console.error(data.toString().trim()));
            shell.on('close', code => resolve(code));
        })
        if (code !== 0) {
            code = new Promise((resolve, reject) => {
                const shell = spawn('ffmpeg', ['-f', 'concat', '-safe', '0', '-i', this.txt_path, '-c', 'copy', this.mp4_path2]);
                console.log(shell.spawnargs.join(' '));
                shell.stdout.on('data', data => console.log(data.toString().trim()));
                shell.stderr.on('data', data => console.error(data.toString().trim()));
                shell.on('close', code => resolve(code));
            });
        }
        if (code === 0 && this.existsMp4()) {
            console.log(`merge: ${this.mp4_path} success!`);
            for (let i = 0; i < this.total; i++) {
                let ts_name = ('00000' + i).slice(-1 * (this.total.toString().length)) + '.ts';
                fs.unlinkSync(path.join(this.dir, ts_name));
            }
        } else {
            console.error(`merge: ${this.txt_path} => ${this.mp4_path} failed!`);
        }
    }
    this.fetchAllTs = async () => {
        return new Promise((resolve, reject) => {
            const tasks = [];
            for (let i = 0; i < this.total; i++) {
                tasks.push(i);
            }
            const works = [];
            for (let i = 1; i <= THREAD; i++) {
                works.push(i);
            }
            for (let i = 0; i < THREAD; i++) {
                (async () => {
                    while (true) {
                        const task = tasks.shift();
                        if (task === undefined && works.length === THREAD) { // 没有任务了 且 工人都在休息
                            resolve(true);
                            break;
                        }
                        if (task === undefined) {
                            await sleep(50);
                        } else {
                            do {
                                const work = works.shift();
                                if (work) {
                                    console.log(`work#${work} begin task#${task}, has ${tasks.length} tasks to ${works.length} works.`);
                                    try { await this.fetchTs(task); } catch (err) { console.error('fetchTs error', err); }
                                    works.push(work);
                                    console.log(`work#${work} end task#${task}, has ${tasks.length} tasks to ${works.length} works.`);
                                    break;
                                }
                            } while (true);
                        }
                    }
                })();
            }
        });
    }
    this.start = async () => {
        if (this.existsMp4()) {
            console.log(this.mp4_path);
            return;
        }
        console.log(`start: url=${this.url} id=${this.id} name=${this.name}`);
        try { await this.fetchWeb(); } catch (err) { console.error('fetchWeb error', err); }
        if (this.existsMp4()) {
            console.log(this.mp4_path);
            return;
        }
        try { await this.fetchM3u8(); } catch (err) { console.error('fetchM3u8 error', err); }
        try { await this.fetchAllTs(); } catch (err) { console.error('fetchAllTs error', err); }
        try { await this.merge(); } catch (err) { console.error('merge error', err); }
    }
    this.init(name);
    return this;
}