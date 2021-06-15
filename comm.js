const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const Proxy = require('https-proxy-agent');

const { TMP_DIR, MP4_DIR, PROXY, RETRY, THREAD, USER_AGENT } = require('./conf');
const CACHE_DIR = path.join(TMP_DIR, '.Cache')
const DATA_FILE = path.join(TMP_DIR, '.data.json')

function mkdir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
}

mkdir(TMP_DIR), mkdir(CACHE_DIR), mkdir(MP4_DIR);

function getCache(url) {
    let cache_file = url.split('://')[1].replace(/\//g, '_');
    return path.join(CACHE_DIR, cache_file);
}

async function sleep(ms) {
    return new Promise((resolve, reject) => {
        setTimeout(function() {
            resolve(true);
        }, ms);
    });
}

function options(useProxy, authority, referer) {
    const opts = {
        headers: {
            'pragma': 'no-cache',
            'cache-control': 'no-cache',
            'origin': 'https://jable.tv',
            'accept': '*/*',
            'sec-fetch-site': 'cross-site',
            'sec-fetch-mode': 'cors',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7,zh-TW;q=0.6',
            'user-agent': USER_AGENT,
        }
    };
    if (useProxy) { opts.agent = new Proxy(`http://${PROXY}`); }
    if (authority) { opts.headers.authority = authority; }
    if (referer) { opts.headers.referer = referer; }
    return opts;
}

async function fetchBody(url, useProxy, trys) {
    if (trys >= RETRY) {
        console.log(`fetchBody: #${trys} ${url} => cancel`);
        return;
    }
    trys = trys || 1;
    const res = await fetch(url, options(useProxy));
    console.log(`fetchBody: #${trys} ${url} => ${res.status} ${res.statusText}`);
    if (res.status === 200) {
        return await res.text();
    } else {
        await sleep(1000); // 一秒后重试
        return await fetchBody(url, options(useProxy), ++trys);
    }
}

async function fetchSave(url, save_path, useProxy, authority, referer, trys) {
    if (trys >= RETRY) {
        console.log(`fetchSave: #${trys} ${url} => cancel`);
        return;
    }
    trys = trys || 1;
    const res = await fetch(url, options(useProxy, authority, referer));
    console.log(`fetchSave: #${trys} ${url} => ${res.status} ${res.statusText}`);
    if (res.status === 200) {
        const buff = await res.buffer();
        fs.writeFileSync(save_path, buff, 'binary');
        return res.status;
    } else {
        if (fs.existsSync(save_path)) {
            fs.unlinkSync(save_path);
        }
        await sleep(1000); // 一秒后重试
        return await fetchSave(url, save_path, useProxy, authority, referer, ++trys);
    }
}

module.exports = {
    DATA_FILE: DATA_FILE,
    getCache: getCache,
    mkdir: mkdir,
    sleep: sleep,
    fetchBody: fetchBody,
    fetchSave: fetchSave,
}
