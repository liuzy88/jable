all:
	if [ ! -e 'node_modules' ]; then npm install; fi
	rm -rf ./JableTmp/.Cache/*
	node index.js
	node jable.js
clear:
	rm -rf ./JableTmp/.Cache/*
pkg:
	if [ ! -e 'node_modules' ]; then npm install; fi
	if [ "x`which pkg`" == "x" ]; then npm install pkg -g; fi
	mkdir -p bin
	rm -rf bin/jable-*
	mv data.json data.json.bak
	echo '{}' > data.json
	pkg jable.js --out-path bin/
	mv data.json.bak data.json
