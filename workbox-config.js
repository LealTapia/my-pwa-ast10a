module.exports = {
	globDirectory: 'dist/',
	globPatterns: [
		'**/*.{js,css,svg,html}'
	],
	swDest: 'dist/sw.js',
	ignoreURLParametersMatching: [
		/^utm_/,
		/^fbclid$/
	]
};