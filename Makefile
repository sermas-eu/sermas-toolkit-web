
build:
	npm run build

build/watch:
	npm run build:watch

link: build
	cd dist && sudo npm link