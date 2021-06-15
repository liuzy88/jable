all:
	if [ ! -e 'node_modules' ]; then npm install; fi
	node index.js
	node main.js
clear:
	rm -rf ./JableTmp/.Cache/*
pkg:
	if [ ! -e 'node_modules' ]; then npm install; fi
	if [ "x`which pkg`" == "x" ]; then npm install pkg -g; fi
	mkdir -p bin
	rm -rf bin/*
	pkg main.js --out-path bin/
