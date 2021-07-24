const fs = require('fs');
const path = require('path');

const DB = require('./db');
const { MP4_DIR } = require('./conf');

(async () => {
    await DB.connect();
    const files = fs.readdirSync(MP4_DIR);
    let mp4 = 0, update = 0;
    for (let i = 0; i < files.length; i++) {
        if (files[i].endsWith('.mp4')) {
            mp4++;
            const name = path.basename(files[i], '.mp4');
            const data = await DB.Model.findByPk(name.split(' ')[0].toLowerCase());
            if (data != null && data.saved == 0) {
                update++;
                data.saved = 1;
                data.save();
            }
        }
    }
    console.log(`本次录入 ${update} ，当前已下载 ${mp4}`)
    const data1 = await DB.query(`SELECT count(1) as num from jable`);
    const data2 = await DB.query(`SELECT count(1) as num from jable where saved=1`);
    console.log(`库中共计 ${data1[0].num} ，当前已保存 ${data2[0].num}`)
})().catch(err => console.error(err));