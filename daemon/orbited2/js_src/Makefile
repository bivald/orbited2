all: debug

debug:
	#jsio compile Orbited2.pkg -o ../static/Orbited2.js -d
	jsio_compile Orbited2.pkg -j /home/niklas/js.io/packages/ -o ../static/Orbited2.js 

release:
	jsio compile Orbited2.pkg -o ../static/Orbited2.min.js -g --closure ./closure.jar
	cp ../static/Orbited2.min.js ../static/Orbited2.min.js.bak
	rm ../static/Orbited2.min.js.gz
	gzip ../static/Orbited2.min.js
	mv ../static/Orbited2.min.js.bak ../static/Orbited2.min.js

clean:
	rm ../static/*.js
	rm ../static/*.js.gz
