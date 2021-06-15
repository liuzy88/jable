const fs = require('fs');
const path = require('path');
const Cookie = require('cookie');
const fetch = require('node-fetch');
const Proxy = require('https-proxy-agent');

const { TMP_DIR, MP4_DIR, PROXY, RETRY, USER_AGENT } = require('./conf');
const CACHE_DIR = path.join(TMP_DIR, '.Cache')
const DATA_FILE = path.join(__dirname, 'data.json')

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

const COOKIES = {};

function gotCookie(cookies) {
    if (cookies.length) {
        for (let i = 0; i < cookies.length; i++) {
            const cookie = Cookie.parse(cookies[i].trim());
            COOKIES[Object.keys(cookie)[i]] = cookie;
        }
    }
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
    if (COOKIES.length) {
        const cookies = [];
        for (let k in COOKIES) {
            cookies.push(`${k}=${COOKIES[k][k]}`);
        }
        opts.headers['Cookie'] = cookies.join('; ');
    }
    return opts;
}

async function fetchBody(url, useProxy, trys) {
    trys = trys || 0;
    console.log(`fetchBody: #${trys} ${url}`);
    const res = await fetch(url, options(useProxy));
    console.log(`fetchBody: #${trys} ${url} => ${res.status} ${res.statusText}`);
    gotCookie(res.headers.raw()['set-cookie'] || []);
    if (res.status === 200) {
        return await res.text();
    } else if (res.status === 404) {
        // cancel
    } else {
        if (++trys >= 2) {
            console.log(`fetchBody: #${trys} ${url} => cancel`);
            return;
        }
        await sleep(1000); // 一秒后重试
        return await fetchBody(url, options(useProxy), trys);
    }
}

async function fetchSave(url, save_path, useProxy, authority, referer, trys) {
    if (fs.existsSync(save_path)) {
        console.log(`fetchSave: #${trys} ${url} => exists`);
        return;
    }
    trys = trys || 0;
    console.log(`fetchSave: #${trys} ${url}`);
    const res = await fetch(url, options(useProxy, authority, referer));
    console.log(`fetchSave: #${trys} ${url} => ${save_path} ${res.status} ${res.statusText}`);
    gotCookie(res.headers.raw()['set-cookie'] || []);
    if (res.status === 200) {
        const buff = await res.buffer();
        fs.writeFileSync(save_path, buff, 'binary');
        return res.status;
    } else {
        if (fs.existsSync(save_path)) {
            fs.unlinkSync(save_path);
        }
        if (++trys >= RETRY) {
            console.log(`fetchSave: #${trys} ${url} => cancel`);
            return;
        }
        await sleep(1000); // 一秒后重试
        return await fetchSave(url, save_path, useProxy, authority, referer, trys);
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
