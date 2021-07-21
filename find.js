const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'JableTmp');

const dd = fs.readdirSync(dir)
for (let i = 0; i < dd.length; ++i) {
	const d = path.join(dir, dd[i]);
	if (!dd[i].startsWith('.')) {
		const ds = fs.readdirSync(d)
		if (ds.length === 0) {
		} else if (ds.length === 1) {
			console.log('delete', path.join(d, ds[0]));
			fs.unlinkSync(path.join(d, ds[0]));
		} else if (ds.length < 3) {
			console.log(d, ds.length);
		} else if (ds.length > 3) {
			console.log(d, ds.length);
		}
	}
}