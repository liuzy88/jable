const DB = require('./db');
const Jable = require('./jable');

(async () => {
    const arr = require('./3_unfinished');
    if (arr.length > 0) {
        for (let i = 0; i < arr.length; i++) {
            await new Jable(`https://jable.tv/videos/${arr[i].toLowerCase()}/`).start();
        }
    } else {
        await DB.connect();
        const data = await DB.Model.findAndCountAll({
            limit: 1000,
            offset: 0,
            where: {
                saved: 0,
            }
        });
        for (let i = 0; i < data.rows.length; i++) {
            const d = data.rows[i];
            await new Jable(d.url, d.name).start();
        }
    }
})().catch(err => console.error(err));
