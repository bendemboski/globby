'use strict';
const fs = require('fs');
const path = require('path');
const fastGlob = require('fast-glob');
const gitIgnore = require('ignore');
const pify = require('pify');
const slash = require('slash');

const DEFAULT_IGNORE = [
	'**/node_modules/**',
	'**/bower_components/**',
	'**/flow-typed/**',
	'**/coverage/**',
	'**/.git'
];

const readFileP = pify(fs.readFile);
const readdirP = pify(fs.readdir);

const mapGitIgnorePatternTo = base => ignore => {
	if (ignore.startsWith('!')) {
		return '!' + path.posix.join(base, ignore.substr(1));
	}

	return path.posix.join(base, ignore);
};

const parseGitIgnore = (content, opts) => {
	const base = slash(path.relative(opts.cwd, path.dirname(opts.fileName)));

	return content
		.split(/\r?\n/)
		.filter(Boolean)
		.filter(l => l.charAt(0) !== '#')
		.map(mapGitIgnorePatternTo(base));
};

const reduceIgnore = files => {
	return files.reduce((ignores, file) => {
		ignores.add(parseGitIgnore(file.content, {
			cwd: file.cwd,
			fileName: file.filePath
		}));
		return ignores;
	}, gitIgnore());
};

const getIsIgnoredPredecate = (ignores, cwd) => {
	return p => ignores.ignores(slash(path.relative(cwd, p)));
};

const getFile = (file, cwd) => {
	const filePath = path.join(cwd, file);
	return readFileP(filePath, 'utf8')
		.then(content => ({
			content,
			cwd,
			filePath
		}));
};

const getFileSync = (file, cwd) => {
	const filePath = path.join(cwd, file);
	const content = fs.readFileSync(filePath, 'utf8');

	return {
		content,
		cwd,
		filePath
	};
};

const getIgnoreFilter = cwd => {
	return getFile('.gitignore', cwd)
		.catch(() => undefined)
		.then(file => reduceIgnore(file ? [file] : []))
		.then(ignores => getIsIgnoredPredecate(ignores, cwd));
};

const getIgnore = opts => {
	return Promise.all([readdirP(opts.cwd), getIgnoreFilter(opts.cwd)])
		.then(([files, filter]) => files.filter(filter))
		.then(ignore => ignore.concat(opts.ignore));
};

const getIgnoreFilterSync = cwd => {
	let file;
	try {
		file = getFileSync('.gitignore', cwd);
	} catch (err) {}

	const ignores = reduceIgnore(file ? [file] : []);
	return getIsIgnoredPredecate(ignores, cwd);
};

const getIgnoreSync = opts => {
	const files = fs.readdirSync(opts.cwd);
	const filter = getIgnoreFilterSync(opts.cwd);
	const gitIgnore = files.filter(filter);
	return gitIgnore.concat(opts.ignore);
};

const normalizeOpts = opts => {
	opts = opts || {};
	const ignore = (opts.ignore || []).concat(DEFAULT_IGNORE);
	const cwd = opts.cwd || process.cwd();
	return {ignore, cwd};
};

module.exports = o => {
	const opts = normalizeOpts(o);

	return getIgnore(opts)
		.then(ignore => fastGlob('**/.gitignore', {ignore, cwd: opts.cwd}))
		.then(paths => Promise.all(paths.map(file => getFile(file, opts.cwd))))
		.then(files => reduceIgnore(files))
		.then(ignores => getIsIgnoredPredecate(ignores, opts.cwd));
};

module.exports.sync = o => {
	const opts = normalizeOpts(o);

	const ignore = getIgnoreSync(opts);
	const paths = fastGlob.sync('**/.gitignore', {ignore, cwd: opts.cwd});
	const files = paths.map(file => getFileSync(file, opts.cwd));
	const ignores = reduceIgnore(files);
	return getIsIgnoredPredecate(ignores, opts.cwd);
};
