// Copyright (c) 2010
// Michael Carter (cartermichael@gmail.com)
// Martin Hunt (mghunt@gmail.com)
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

// Initialization of js.io occurs in a closure, preventing local variables
// from entering the global scope.  During execution, the method `jsio` is
// added to the global scope.

;(function() {
	function init(cloneFrom) {
		// We expect this code to be minified before production use, so we may
		// write code slightly more verbosely than we otherwise would.
	
		// Should we parse syntax errors in the browser?
		var DEBUG = true;
	
		// Store a reference to the slice function for converting objects of
		// type arguments to type array.
		var SLICE = Array.prototype.slice;
	
		// js.io supports multiple JavaScript environments such as node.js and
		// most web browsers (IE, Firefox, WebKit).  The ENV object wraps 
		// any utility functions that contain environment-specific code (e.g.
		// reading a file using node's `fs` library or a browser's
		// `XMLHttpRequest`).  Running js.io in other JavaScript environments
		// is as easy as implementing an environment object that conforms to 
		// the abstract interface for an environment (provided below) and 
		// calling `jsio.setEnv()`.
		var ENV;
	
		// Checks if the last character in a string is `/`.
		var rexpEndSlash = /\/$/;

		function getModuleDef (path) {
			path += '.js';
			return jsio.__modules[path] || new ModuleDef(path);
		}
	
		// Creates an object containing metadata about a module.
		function ModuleDef (path) {
			this.path = path;
			util.splitPath(path, this);
		};

		ModuleDef.prototype.setBase = function (baseMod, basePath) {
			this.baseMod = baseMod;
			this.basePath = basePath;
		};
	
		// Utility functions
		var util = {
				// `util.bind` returns a function that, when called, will execute
				// the method passed in with the provided context and any additional
				// arguments passed to `util.bind`.
				//       util.bind(obj, 'f', a) -> function() { return obj.f(a); }
				//       util.bind(obj, g, a, b, c) -> function() { return g.call(g, a, b, c); }
				bind: function(context, method/*, args... */) {
					var args = SLICE.call(arguments, 2);
					return function() {
						method = (typeof method == 'string' ? context[method] : method);
						return method.apply(context, args.concat(SLICE.call(arguments, 0)));
					};
				},
			
				// `util.addEndSlash` accepts a string.  That string is returned with a `/`
				// appended if the string did not already end in a `/`.
				addEndSlash: function(str) {
					return rexpEndSlash.test(str) ? str : str + '/';
				},
			
				// `util.removeEndSlash` accepts a string.  It removes a trailing `/` if
				// one is found.
				removeEndSlash: function(str) {
					return str.replace(rexpEndSlash, '');
				},
			
				// `util.makeRelativePath` accepts two paths (strings) and returns the first path
				// made relative to the second.  Note: this function needs some work.  It currently
				// handles the most common use cases, but may fail in unexpected edge cases.
				// 
				//  - Simple case: if `path` starts with `relativeTo`, then we can strip `path` 
				// off the `relativeTo` part and we're done.
				//
				//         util.makeRelativePath('abc/def/', 'abc') -> 'def'
				//
				//  - Harder case: `path` starts with some substring of `relativeTo`.  We want to remove this substring and then add `../` for each remaining segment of `relativeTo`.
				//
				//         util.makeRelativePath('abc/def/', 'abc/hij') -> '../def'
				//
				makeRelativePath: function(path, relativeTo) {
					var len = relativeTo.length;
					if (path.substring(0, len) == relativeTo) {
						/* Note: we're casting a boolean to an int by adding len to it */
						return path.slice((path.charAt(len) == '/') + len);
					}
				
					var sA = util.removeEndSlash(path).split('/'),
						sB = util.removeEndSlash(relativeTo).split('/'),
						i = 0;
				
					/* Count how many segments match. */
					while(sA[i] == sB[i]) { ++i; }
				
					if (i) {
						/* If at least some segments matched, remove them.  The result is our new path. */
						path = sA.slice(i).join('/');
					
						/* Prepend `../` for each segment remaining in `relativeTo`. */
						for (var j = sB.length - i; j > 0; --j) { path = '../' + path; }
					}
				
					return path;
				},
			
				// `buildPath` accepts an arbitrary number of string arguments to concatenate into a path.
				//     util.buildPath('a', 'b', 'c/', 'd/') -> 'a/b/c/d/'
				buildPath: function() {
					return util.resolveRelativePath(Array.prototype.join.call(arguments, '/'));
				},
			
				// `resolveRelativePath` removes relative path indicators.  For example:
				//     util.resolveRelativePath('a/../b') -> b
				resolveRelativePath: function(path) {
					/* If the path starts with a protocol, store it and remove it (add it
					   back later) so we don't accidently modify it. */
					var protocol = path.match(/^(\w+:\/\/)(.*)$/);
					if (protocol) { path = protocol[2]; }
				
					/* Remove multiple slashes and trivial dots (`/./ -> /`). */
					path = path.replace(/\/+/g, '/').replace(/\/\.\//g, '/');
				
					/* Loop to collapse instances of `../` in the path by matching a previous
					   path segment.  Essentially, we find substrings of the form `/abc/../`
					   where abc is not `.` or `..` and replace the substrings with `/`.
					   We loop until the string no longer changes since after collapsing all
					   possible instances once, we may have created more instances that can
					   be collapsed.
					*/
					var o;
					while((o = path) != (path = path.replace(/(^|\/)(?!\.?\.\/)([^\/]+)\/\.\.\//g, '$1'))) {}
					/* Don't forget to prepend any protocol we might have removed earlier. */
					return protocol ? protocol[1] + path : path;
				},
			
				resolveRelativeModule: function (modulePath, directory) {
					var result = [],
						parts = modulePath.split('.'),
						len = parts.length,
						relative = (len > 1 && !parts[0]),
						i = relative ? 0 : -1;
				
					while(++i < len) { result.push(parts[i] ? parts[i] : '..'); }
					return util.buildPath(relative ? directory : '', result.join('/'));
				},
				resolveModulePath: function (modulePath, directory) {
					// resolve relative paths
					if (modulePath.charAt(0) == '.') {
						return [getModuleDef(util.resolveRelativeModule(modulePath, directory))];
					}
				
					// resolve absolute paths with respect to jsio packages/
					var pathSegments = modulePath.split('.');
					var baseMod = pathSegments[0];
					var pathString = pathSegments.join('/');
					
					if (jsioPath.cache.hasOwnProperty(baseMod)) {
						return [getModuleDef(util.buildPath(jsioPath.cache[baseMod], pathString))];
					}
				
					var defs = [];
					var paths = jsioPath.get();
					var len = paths.length;
					for (var i = 0; i < len; ++i) {
						var moduleDef = getModuleDef(util.buildPath(paths[i], pathString));
						moduleDef.setBase(baseMod, paths[i]);
						defs.push(moduleDef);
					}
					return defs;
				},
				splitPath: function(path, result) {
					if (!result) { result = {}; }
					var i = path.lastIndexOf('/') + 1;
					result.directory = path.substring(0, i);
					result.filename = path.substring(i);
					return result;
				}
			};
		
		// construct the top-level jsio object
		var jsio = util.bind(this, importer, null, null, null);

		jsio.__util = util;
		jsio.__init__ = init;

		var srcCache;
		jsio.setCache = function(cache) { srcCache = jsio.__srcCache = cache; }
		jsio.setCache(cloneFrom && cloneFrom.__srcCache || {});

		jsio.setCachedSrc = function(path, src) { srcCache[path] = { path: path, src: src }; }
		jsio.getCachedSrc = function(path) { return srcCache[path]; }

		jsio.__filename = 'jsio.js';
		jsio.__cmds = [];
		jsio.__jsio = jsio;
		jsio.__importer = importer;
		jsio.__modules = {preprocessors:{}};
		var jsioPath = {
				set: function(path) { jsioPath.value = (typeof path == 'string' ? [path] : path); },
				get: function() { return jsioPath.value.slice(0); },
				add: function(path) {
					var v = jsioPath.value, len = v.length;
					for (var i = 0; i < len; ++i) {
						if (v[i] == path) { return; }
					}
					v.push(path);
				},
				remove: function(path) {
					var v = jsioPath.value, len = v.length;
					for (var i = 0; i < len; ++i) {
						if (v[i] == path) {
							v.splice(i, 1);
						}
					}
				},
				value: [],
				cache: {}
			};
		
		jsio.path = jsioPath;
		jsio.addPath = util.bind(jsioPath, 'add');
		jsio.addCmd = util.bind(jsio.__cmds, 'push');
		
		jsio.setEnv = function(envCtor) {
			if (!envCtor && cloneFrom) {
				ENV = cloneFrom.__env;
			} else {
				if (typeof envCtor == 'string') {
					envCtor = ({
							node: ENV_node,
							browser: ENV_browser
						})[envCtor] || ENV_browser;
				}

				ENV = new envCtor(util);
			}

			this.__env = ENV;
			this.__dir = ENV.getCwd();
			this.path.set(ENV.getPath());
		}
		
		if (cloneFrom) {
			jsio.setEnv();
		} else if (typeof process !== 'undefined' && process.version) {
			jsio.setEnv('node');
		} else if (typeof XMLHttpRequest != 'undefined' || typeof ActiveXObject != 'undefined') {
			jsio.setEnv('browser');
		}

		/*
		function ENV_abstract() {
			this.global = null;
			this.getCwd = function() {};
			this.getPath = function() {};
			this.eval = function(code, path) {};
			this.fetch = function(path) { return contentsOfPath; };
			this.log = function(args...) {};
		}
		*/
	
		function ENV_node() {
			var fs = require('fs');
			var path = require('path');
			
			this.name = 'node';
			this.global = GLOBAL;
			this.getCwd = process.cwd;

			this.log = function() {
				var msg;
				try {
					msg = Array.prototype.map.call(arguments, function(a) {
							if ((a instanceof Error) && a.message) {
								return 'Error:' + a.message + '\nStack:' + a.stack + '\nArguments:' + a.arguments;
							}
							return (typeof a == 'string' ? a : JSON.stringify(a));
						}).join(' ') + '\n';
				} catch(e) {
					msg = Array.prototype.join.call(arguments, ' ') + '\n';
				}

				process.stderr.write(msg);
				return msg;
			}
			
			this.getPath = function() {
				var segments = __filename.split('/');
				segments.pop();
				return util.makeRelativePath(segments.join('/') || '.', this.getCwd());
			}
			
			if (process.compile) {
				this.eval = process.compile;
			} else {
				var vm = require('vm');
				this.eval = function (code, path) {
					try {
						return vm.runInThisContext(code, path);
					} catch (e) {
						this.log('In ' + path + ':\n' + e.message);
						throw e;
					}
				}
			}
			
			this.fetch = function(p) {
				try {
					var dirname = path.dirname(p);
					var filename = path.basename(p);
					var lowerFilename = filename.toLowerCase();
					var files = fs.readdirSync(dirname);
				} catch (e) {
					return false;
				}

				for (var i = 0, testName; testName = files[i]; ++i) {
					if (testName.toLowerCase() == lowerFilename && testName != filename) {
						throw "Invalid case when importing [" + p + "].  You probably meant" + testName;
					}
				}

				try {
					return fs.readFileSync(p, 'utf8');
				} catch(e) {
					return false;
				}
			}
			
			this.require = require;
		}
	
		function ENV_browser() {
			var XHR = window.XMLHttpRequest || function() { return new ActiveXObject("Msxml2.XMLHTTP"); },
				cwd = null,
				path = null,
				JOIN = Array.prototype.join;
			
			this.name = 'browser';
			this.global = window;
			if (!this.global.jsio) { this.global.jsio = jsio; }
		
			if (window.console && console.log) {
				if (!console.log.apply || /Android|iPhone|iPad|iPod/.test(navigator.userAgent)) {
					this.log = function () {
						var args = JOIN.call(arguments, ' ');
						console.log(args);
						return args;
					}
				} else {
					this.log = function () {
						console.log.apply(console, arguments);
						return JOIN.call(arguments, ' ');
					}
				}
			} else {
				this.log = function () { return JOIN.call(arguments, ' '); }
			}

			this.getCwd = function() {
				if(!cwd) {
					var loc = window.location, path = loc.pathname;
					cwd = loc.protocol + '//' + loc.host + path.substring(0, path.lastIndexOf('/') + 1);
				}
				return cwd;
			}
		
			this.getPath = function() {
				if(!path) {
					try {
						var filename = new RegExp('(.*?)' + jsio.__filename + '(\\?.*)?$'),
							scripts = document.getElementsByTagName('script');
					
						for (var i = 0, script; script = scripts[i]; ++i) {
							var result = script.src.match(filename);
							if (result) {
								path = result[1];
								if (/^[A-Za-z]*:\/\//.test(path)) { path = util.makeRelativePath(path, this.getCwd()); }
								break;
							}
						}
					} catch(e) {}
				
					if(!path) { path = '.'; }
				}
				return path;
			}
		
			this.debugPath = function(path) { return path; }

			// IE6 won't return an anonymous function from eval, so use the function constructor instead
			var rawEval = typeof eval('(function(){})') == 'undefined'
				? function(src, path) { return (new Function('return ' + src))(); }
				: function(src, path) { var src = src + '\n//@ sourceURL=' + path; return window.eval(src); };

			// provide an eval with reasonable debugging
			this.eval = function(code, path, origCode) {
				try {
					return rawEval(code, this.debugPath(path));
				} catch(e) {
					if(e instanceof SyntaxError) {
						ENV.log("a syntax error is preventing execution of " + path);
						if (DEBUG && this.checkSyntax) {
							this.checkSyntax(origCode, path);
						}
					}
					throw e;
				}
			}
		
			this.checkSyntax = function(code, path) {
				try {
					var syntax = jsio('import util.syntax', {suppressErrors: true, dontExport: true}),
						result = syntax(code);
					syntax.display(result, path);
				} catch(e) {}
			}
		
			this.fetch = function(path) {
				var xhr = new XHR();
				try {
					xhr.open('GET', path, false);
					xhr.send(null);
				} catch(e) {
					ENV.log('e:', e);
					return false; // firefox file://
				}
			
				if (xhr.status == 404 || // all browsers, http://
					xhr.status == -1100 || // safari file://
					// XXX: We have no way to tell in opera if a file exists and is empty, or is 404
					// XXX: Use flash?
					//(!failed && xhr.status == 0 && !xhr.responseText && EXISTS)) // opera
					false)
				{
					return false;
				}
			
				return xhr.responseText;
			}
		};
	
		var preprocessorCheck = /^"use (.*?)"\s*;\s*\n/,
			preprocessorFunc = /^(.+)\(.+\)$/,
			failedFetch = {};
	
		function findModule(possibilities, opts) {
			var src;
			for (var i = 0, possible; possible = possibilities[i]; ++i) {
				var path = possible.path,
					cachedVersion = srcCache[path];
				
				if (cachedVersion) {
					possible.src = cachedVersion.src;
					possible.pre = true;
					return possible;
				}
			
				/*if (/^\.\//.test(path)) {
					// remove one path segment for each dot from the cwd 
					path = addEndSlash(ENV.getCwd()) + path;
				}*/
			
				src = ENV.fetch(path);
			
				if (src !== false) {
					possible.src = src;
					return possible;
				} else {
					failedFetch[path] = true;
				}
			}
		
			return false;
		}
	
		// load a module from a file
		function loadModule (fromDir, fromFile, modulePath, opts) {
			var possibilities = util.resolveModulePath(modulePath, fromDir);
			for (var i = 0, p; p = possibilities[i]; ++i) {
				var path = possibilities[i].path;
				if (!opts.reload && (path in jsio.__modules)) {
					return possibilities[i];
				}

				if (path in failedFetch) { possibilities.splice(i--, 1); }
			}
		
			if (!possibilities.length) {
				if (opts.suppressErrors) { return false; }
				var e = new Error('Module failed to load (again)');
				e.jsioLogged = true;
				throw e;
			}
		
			var moduleDef = findModule(possibilities, opts),
				match;
		
			if (!moduleDef) {
				if (opts.suppressErrors) { return false; }
				var paths = [];
				for (var i = 0, p; p = possibilities[i]; ++i) { paths.push(p.path); }
				throw new Error(fromDir + fromFile + ": \n\tcurrent directory: " + ENV.getCwd() + "\n\tlooked in:\n\t\t" + paths.join('\n\t\t') + '\n\tImport Stack:\n\t\t' + importStack.join('\n\t\t') + "\n\tError: requested import (" + modulePath + ") not found.");
			}
		
			// a (potentially) nicer way to refer to a module -- how it was referenced in code when it was first imported
			moduleDef.friendlyPath = modulePath;
			
			// cache the base module's path in the path cache so we don't have to
			// try out all paths the next time we see the same base module.
			if (moduleDef.baseMod && !(moduleDef.baseMod in jsioPath.cache)) {
				jsioPath.cache[moduleDef.baseMod] = moduleDef.basePath;
			}

			// don't apply the standard preprocessors to base.js.  If we're reloading
			// the source code, always apply them.  We also don't want to run them
			// if they've been run once -- moduleDef.pre is set to true already
			// if we're reading the code from the source cache.
			if (modulePath != 'base' && (opts.reload || !opts.dontPreprocess && !moduleDef.pre)) {
				moduleDef.pre = true;

				applyPreprocessors(fromDir, moduleDef, ["import", "cls"], opts);

				// the order here is somewhat arbitrary and might be overly restrictive (... or overly powerful)
				// while (moduleDef.src.charAt(0) == '"' && (match = moduleDef.src.match(preprocessorCheck))) {
				// 	moduleDef.src = moduleDef.src.substring(match[0].length - 1);
				// 	applyPreprocessors(fromDir, moduleDef, match[1].split(','), opts);
				// }
			}

			// any additional preprocessors?
			if (opts.preprocessors) {
				applyPreprocessors(fromDir, moduleDef, opts.preprocessors, opts);
			}

			return moduleDef;
		}
	
		function applyPreprocessors(path, moduleDef, names, opts) {
			for (var i = 0, len = names.length; i < len; ++i) {
				p = getPreprocessor(names[i]);
				if (p) {
					p(path, moduleDef, opts);
				}
			}
		}
		
		function getPreprocessor(name) {
			var module = jsio.__modules['preprocessors.' + name];
			return typeof name == 'function'
				? name
				: (module && module.exports
					|| jsio('import preprocessors.' + name, {dontExport: true, dontPreprocess: true}));
		}
	
		function execModuleDef(context, moduleDef) {
			var src = moduleDef.src;
			delete moduleDef.src;

			var code = "(function(_){with(_){delete _;return function $$" + moduleDef.friendlyPath.replace(/[\/.]/g, '_') + "(){" + src + "\n}}})";
			var fn = ENV.eval(code, moduleDef.path, src);
			fn = fn(context);
			fn.call(context.exports);
		};
		
		function resolveImportRequest(context, request, opts) {
			var cmds = jsio.__cmds,
				imports = [],
				result = false;
		
			for (var i = 0, imp; imp = cmds[i]; ++i) {
				if ((result = imp(context, request, opts, imports))) { break; }
			}
		
			if (result !== true) {
				throw new (typeof SyntaxError != 'undefined' ? SyntaxError : Error)(String(result || 'invalid jsio command: jsio(\'' + request + '\')'));
			}
		
			return imports;
		};
	
		function makeContext(ctx, modulePath, moduleDef, dontAddBase) {
			if (!ctx) { ctx = {}; }
			if (!ctx.exports) { ctx.exports = {}; }

			ctx.jsio = util.bind(this, importer, ctx, moduleDef.directory, moduleDef.filename);
			ctx.require = function(request, opts) {
				if (!opts) { opts = {}; }
				opts.dontExport = true;
				// opts.suppressErrors = true;
				
				try {
					var ret = ctx.jsio(request, opts);
					if (ret === false) {
						// need this to trigger require attempt due to suppresserrors = true
						throw "module failed to load";
					} else {
						return ret;
					}
				} catch(e) {
					ENV.log('Error loading request ' + request + ':');
					ENV.log(e);
				}
			};
			
			ctx.module = {id: modulePath, exports: ctx.exports};
			if (!dontAddBase && modulePath != 'base') {
				ctx.jsio('from base import *', {dontPreprocess: true});
				ctx.logging.__create(modulePath, ctx);
			}
		
			// TODO: FIX for "trailing ." case
			ctx.jsio.__jsio = jsio;
			ctx.jsio.__env = jsio.__env;
			ctx.jsio.__dir = moduleDef.directory;
			ctx.jsio.__filename = moduleDef.filename;
			ctx.jsio.path = jsioPath;
			return ctx;
		};
		
		var importStack = [];
		function importer(boundContext, fromDir, fromFile, request, opts) {
			opts = opts || {};
			fromDir = fromDir || './';
			fromFile = fromFile || '<initial file>';
		
			// importer is bound to a module's (or global) context -- we can override this
			// by using opts.exportInto
			var exportInto = opts.exportInto || boundContext || ENV.global;
		
			// parse the import request(s)
			var imports = resolveImportRequest(exportInto, request, opts),
				numImports = imports.length,
				retVal = numImports > 1 ? {} : null;
		
			// import each requested item
			for (var i = 0; i < numImports; ++i) {
				var item = imports[i];
				var modulePath = item.from;
				var modules = jsio.__modules;
				var path;
				var moduleDef;
				var err;
				
				try {
					moduleDef = loadModule(fromDir, fromFile, modulePath, opts);
				} catch(e) {
					err = e;
				}

				if (moduleDef) {
					path = moduleDef.path;
				} else if (jsio.__env.require) {
					path = modulePath;
					try {
						modules[path] = {exports: jsio.__env.require(modulePath)};
						err = null;
					} catch (e2) {
						if (!err) { err = e2; }
					}
				} else if (moduleDef == false) {
					return false;
				}

				if (err) {
					if (opts.suppressErrors) { return false; }
					if (!err.jsioLogged) {
						ENV.log('\nError loading module:\n\trequested:', modulePath, '\n\tfrom:', fromDir + fromFile, '\n\tfull request:', request, '\n');
						err.jsioLogged = true;
					}
					throw err;
				}
				
				if (moduleDef) {
					importStack.push(importStack.length + ' : ' + moduleDef.friendlyPath + ' (' + moduleDef.path + ')');
				}
				
				// eval any packages that we don't know about already
				if (!(path in modules)) {
					var newContext = makeContext(opts.context, modulePath, moduleDef, item.dontAddBase);

					modules[path] = moduleDef;

					moduleDef.exports = newContext.exports;
					if (item.dontUseExports) {
						var src = [';(function(){'], k = 1;
						for (var j in item['import']) {
							newContext.exports[j] = undefined;
							src[k++] = 'if(typeof '+j+'!="undefined"&&exports.'+j+'==undefined)exports.'+j+'='+j+';';
						}
						src[k] = '})();';
						moduleDef.src += src.join('');
					}

					execModuleDef(newContext, moduleDef);
					moduleDef.exports = newContext.exports;
				}
				
				importStack.pop();
			
				var module = modules[path].exports;
			
				// return the module if we're only importing one module
				if (numImports == 1) { retVal = module; }
			
				if (!opts.dontExport) {
					// add the module to the current context
					if (item.as) {
						// remove trailing/leading dots
						var as = item.as.match(/^\.*(.*?)\.*$/)[1],
							segments = as.split('.'),
							kMax = segments.length - 1,
							c = exportInto;
				
						// build the object in the context
						for(var k = 0; k < kMax; ++k) {
							var segment = segments[k];
							if (!segment) continue;
							if (!c[segment]) { c[segment] = {}; }
							c = c[segment];
						}
					
						c[segments[kMax]] = module;
				
						// there can be multiple module imports with this syntax (import foo, bar)
						if (numImports > 1) {
							retVal[as] = module;
						}
					} else if (item['import']) {
						// there can only be one module import with this syntax 
						// (from foo import bar), so retVal will already be set here
						if (item['import']['*']) {
							for (var k in modules[path].exports) { exportInto[k] = module[k]; }
						} else {
							for (var k in item['import']) { exportInto[item['import'][k]] = module[k]; }
						}
					}
				}
			}
		
			return retVal;
		}
	
		// DEFINE SYNTAX FOR JSIO('cmd')
	
		// from myPackage import myFunc
		// external myPackage import myFunc
		jsio.addCmd(function(context, request, opts, imports) {
			var match = request.match(/^\s*(from|external)\s+([\w.$]+)\s+(import|grab)\s+(.*)$/);
			if(match) {
				imports.push({
					from: match[2],
					dontAddBase: match[1] == 'external',
					dontUseExports: match[3] == 'grab' || match[1] == 'external',
					'import': {}
				});
			
				match[4].replace(/\s*([\w.$*]+)(?:\s+as\s+([\w.$]+))?/g, function(_, item, as) {
					imports[0]['import'][item] = as || item;
				});
				return true;
			}
		});

		// import myPackage
		jsio.addCmd(function(context, request, opts, imports) {
			var match = request.match(/^\s*import\s+(.*)$/);
			if (match) {
				match[1].replace(/\s*([\w.$]+)(?:\s+as\s+([\w.$]+))?,?/g, function(_, fullPath, as) {
					imports.push(
						as ? {
							from: fullPath,
							as: as
						} : {
							from: fullPath,
							as: fullPath
						});
				});
				return true;
			}
		});

		// CommonJS syntax
		jsio.addCmd(function(context, request, opts, imports) {
		
			//		./../b -> ..b
			// 		../../b -> ...b
			// 		../b -> ..b
			// 		./b -> .b
		
			var match = request.match(/^\s*[\w.0-9$\/\-]+\s*$/);
			if (match) {
			
				var req = util.resolveRelativePath(match[0]),
					isRelative = req.charAt(0) == '.';
			
				req = req	
					// .replace(/^\//, '') // remove any leading slash
					.replace(/\.\.\//g, '.') // replace relative path indicators with dots
					.replace(/\.\//g, '')
					.replace(/\//g, '.'); // any remaining slashes are path separators

				imports[0] = { from: (isRelative ? '.' : '') + req };
				return true;
			}
		});
		
		jsio.install = function() {
			jsio('from base import *');
			GLOBAL['logger'] = logging.get('jsiocore');
		};
		
		jsio.clone = util.bind(null, init, jsio);

		return jsio;
	}
	var J = init(null, {});
	if (typeof exports != 'undefined') {
		module.exports = J;
	} else {
		jsio = J;
	}
})();
jsio.path.set(["/home/niklas/js.io/packages/"]);jsio.path.cache={"preprocessors":"/home/niklas/js.io/packages/","base":"/home/niklas/js.io/packages/","util":"/home/niklas/js.io/packages/","net":"/home/niklas/js.io/packages/","std":"/home/niklas/js.io/packages/","lib":"/home/niklas/js.io/packages/"};jsio.setCache({"/home/niklas/js.io/packages/base.js":{"path":"/home/niklas/js.io/packages/base.js","directory":"/home/niklas/js.io/packages/","filename":"base.js","baseMod":"base","basePath":"/home/niklas/js.io/packages/","friendlyPath":"base","src":"/**\n * base.js\n * This file contains all global functions provided by js.io.\n */\n\nexports.log = jsio.__env.log;\nexports.GLOBAL = jsio.__env.global;\n\n/**\n * Various polyfill methods to ensure js.io implementations provide\n * a baseline of JavaScript functionality. Feature compatibility (localStorage,\n * etc.) should be provided elsewhere.\n */\n\n// Array.isArray\n// Not available before ECMAScript 5.\n// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/isArray\n\nif (!Array.isArray) {\n\tArray.isArray = function (arg) {\n\t\treturn Object.prototype.toString.call(arg) === '[object Array]';\n\t}\n};\n\n// Function.prototype.bind\n// Not available before ECMAScript 5.\n// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Function/bind\n\nif (!Function.prototype.bind) {\n  Function.prototype.bind = function (oThis) {\n    if (typeof this !== \"function\") {\n      // closest thing possible to the ECMAScript 5 internal IsCallable function\n      throw new TypeError(\"Function.prototype.bind - what is trying to be bound is not callable\");\n    }\n\n    var aArgs = Array.prototype.slice.call(arguments, 1), \n        fToBind = this, \n        fNOP = function () {},\n        fBound = function () {\n          return fToBind.apply(this instanceof fNOP\n                                 ? this\n                                 : oThis,\n                               aArgs.concat(Array.prototype.slice.call(arguments)));\n        };\n\n    fNOP.prototype = this.prototype;\n    fBound.prototype = new fNOP();\n\n    return fBound;\n  };\n}\n\n/**\n * DEPRECATED. Old js.io polyfills.\n */\n\nvar SLICE = Array.prototype.slice;\n\n/* Use native isArray if available\n */\nif (typeof Array.isArray === 'function') {\n\texports.isArray = Array.isArray;\n} else {\n\texports.isArray = function (obj) {\n\t\treturn Object.prototype.toString.call(obj) === '[object Array]';\n\t}\n}\n\nexports.bind = function(context, method /*, VARGS*/) {\n\tif(arguments.length > 2) {\n\t\tvar args = SLICE.call(arguments, 2);\n\t\treturn typeof method == 'string'\n\t\t\t? function __bound() {\n\t\t\t\tif (context[method]) {\n\t\t\t\t\treturn context[method].apply(context, args.concat(SLICE.call(arguments, 0)));\n\t\t\t\t} else {\n\t\t\t\t\tthrow logger.error('No method:', method, 'for context', context);\n\t\t\t\t}\n\t\t\t}\n\t\t\t: function __bound() { return method.apply(context, args.concat(SLICE.call(arguments, 0))); }\n\t} else {\n\t\treturn typeof method == 'string'\n\t\t\t? function __bound() {\n\t\t\t\tif (context[method]) {\n\t\t\t\t\treturn context[method].apply(context, arguments);\n\t\t\t\t} else {\n\t\t\t\t\tthrow logger.error('No method:', method, 'for context', context);\n\t\t\t\t}\n\t\t\t}\n\t\t\t: function __bound() { return method.apply(context, arguments); }\n\t}\n}\n\n/**\n * Class constructor.\n */\n\nexports.Class = function(name, parent, proto) {\n\treturn exports.__class__(function() { return this.init && this.init.apply(this, arguments); }, name, parent, proto);\n}\n\nexports.__class__ = function (cls, name, parent, proto) {\n\tvar clsProto = function () {};\n\tvar logger;\n\n\tif (typeof name != 'string') {\n\t\tproto = parent;\n\t\tparent = name;\n\t\tname = null;\n\t}\n\n\tif (name) {\n\t\tlogger = exports.logging.get(name);\n\t}\n\n\tif (!parent) { throw new Error('parent or prototype not provided'); }\n\tif (!proto) { proto = parent; parent = null; }\n\n\tif (parent) {\n\t\tif (exports.isArray(parent)) { // multiple inheritance, use at your own risk =)\n\t\t\tclsProto.prototype = {};\n\t\t\tfor(var i = 0, p; p = parent[i]; ++i) {\n\t\t\t\tif (p == Error && ErrorParentClass) { p = ErrorParentClass; }\n\t\t\t\tfor (var item in p.prototype) {\n\t\t\t\t\tif (!(item in clsProto.prototype)) {\n\t\t\t\t\t\tclsProto.prototype[item] = p.prototype[item];\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\tparent = parent[0];\n\t\t} else {\n\t\t\tif (parent == Error && ErrorParentClass) { parent = ErrorParentClass; }\n\t\t\tclsProto.prototype = parent.prototype;\n\t\t}\n\t}\n\t\n\tvar supr = parent ? function(context, method, args) {\n\t\t\tvar f = parent.prototype[method];\n\t\t\tif (!f) { throw new Error('method ' + method + ' does not exist'); }\n\t\t\treturn f.apply(context, args || []);\n\t\t} : null;\n\t\n\tcls.prototype = new clsProto();\n\tproto.call(cls.prototype, logger || supr, logger && supr);\n\tcls.prototype.constructor = cls;\n\tcls.prototype.__parentClass__ = parent;\n\tif (name) { cls.prototype.__class__ = name; }\n\treturn cls;\n}\n\nvar ErrorParentClass = exports.__class__(function ErrorCls() {\n\t\tvar err = Error.prototype.constructor.apply(this, arguments);\n\t\tfor (var prop in err) {\n\t\t\tif (err.hasOwnProperty(prop)) {\n\t\t\t\tthis[prop] = err[prop];\n\t\t\t}\n\t\t}\n\t}, function() {});\n\n/**\n * Merge two objects together.\n */\n\nexports.Class.defaults = \nexports.merge = function(base, extra) {\n\tbase = base || {};\n\t\n\tfor (var i = 1, len = arguments.length; i < len; ++i) {\n\t\tvar copyFrom = arguments[i];\n\t\tfor (var key in copyFrom) {\n\t\t\tif (copyFrom.hasOwnProperty(key) && !base.hasOwnProperty(key)) {\n\t\t\t\tbase[key] = copyFrom[key];\n\t\t\t}\n\t\t}\n\t}\n\t\n\treturn base;\n}\n\n/**\n * Create a timer delay.\n */\n\nexports.delay = function(orig, timeout) {\n\tvar _timer = null;\n\tvar ctx, args;\n\tvar f = function() { orig.apply(ctx, args); }\n\treturn function() {\n\t\tctx = this;\n\t\targs = arguments;\n\t\tif (_timer) { clearTimeout(_timer); }\n\t\t_timer = setTimeout(f, timeout || 0);\n\t}\n}\n\n/**\n * Log constructor and default \"logger\".\n */\n\nexports.logging = (function() {\n\t\n\t// logging namespace, this is what is exported\n\tvar logging = {\n\t\t\tDEBUG: 1,\n\t\t\tLOG: 2,\n\t\t\tINFO: 3,\n\t\t\tWARN: 4,\n\t\t\tERROR: 5\n\t\t},\n\t\tloggers = {}, // effectively globals - all loggers and a global production state\n\t\tproduction = false;\n\tvar gPrefix = '';\n\tlogging.setPrefix = function(prefix) { gPrefix = prefix + ' '; }\n\tlogging.setProduction = function(prod) { production = !!prod; }\n\tlogging.get = function(name) {\n\t\treturn loggers.hasOwnProperty(name) ? loggers[name]\n\t\t\t: (loggers[name] = new Logger(name));\n\t}\n\tlogging.set = function(name, _logger) {\n\t\tloggers[name] = _logger;\n\t}\n\t\n\tlogging.getAll = function() { return loggers; }\n\n\tlogging.__create = function(pkg, ctx) { ctx.logger = logging.get(pkg); }\n\t\n\tvar Logger = exports.__class__(\n\t\tfunction Logger(name, level) {\n\t\t\tthis._name = name;\n\t\t\tthis._level = level || logging.LOG;\n\t\t},\n\t\tfunction () {\n\t\t\tthis.setLevel = function(level) { this._level = level; }\n\t\t\n\t\t\tfunction makeLogFunction(level, type) {\n\t\t\t\treturn function() {\n\t\t\t\t\tif (!production && level >= this._level) {\n\t\t\t\t\t\tvar prefix = type + ' ' + gPrefix + this._name,\n\t\t\t\t\t\t\tlistener = this._listener || exports.log;\n\t\t\t\t\t\t\n\t\t\t\t\t\treturn listener && listener.apply(this._listener, [prefix].concat(SLICE.call(arguments)));\n\t\t\t\t\t}\n\t\t\t\t\treturn arguments[0];\n\t\t\t\t}\n\t\t\t}\n\t\t\n\t\t\tthis.setListener = function(listener) { this._listener = listener; }\n\t\t\tthis.debug = makeLogFunction(logging.DEBUG, \"DEBUG\");\n\t\t\tthis.log = makeLogFunction(logging.LOG, \"LOG\");\n\t\t\tthis.info = makeLogFunction(logging.INFO, \"INFO\");\n\t\t\tthis.warn = makeLogFunction(logging.WARN, \"WARN\");\n\t\t\tthis.error = makeLogFunction(logging.ERROR, \"ERROR\");\n\t\t});\n\n\treturn logging;\n})();\n\nvar logger = exports.logging.get('jsiocore');\n"},"./Orbited2.js":{"path":"./Orbited2.js","directory":"./","filename":"Orbited2.js","src":"jsio('from net.protocols.buffered import BufferedProtocol')\njsio('import net');\njsio('import std.uri as Uri');\njsio('import std.JSON');\njsio('import std.utf8 as utf8');\njsio('import std.utf16 as utf16')\njsio('import lib.Enum as Enum');\njsio('import net.errors as errors');\n\nexports.logging = logging;\nexports.logger = logger;\n\nvar originalWebSocket = window.WebSocket;\nvar baseUri = new Uri(window.location);\nvar defaultOrbitedUri;\nvar defaultBrowserLogLevel = 1;\nvar sessionSupport = false;\n\nfunction setup() {\n\tvar scripts = document.getElementsByTagName('script'),\n\t\ttarget = 'Orbited.js',\n\t\tre = new RegExp('(^|/)' + target + '$');\n\t\n\tfor (var i = 0, script; script = scripts[i]; ++i) {\n\t\tvar src = script.src;\n\t\tif (re.test(src)) {\n\t\t\tvar uri = new Uri(src.substring(0, src.length - target.length));\n\t\t\tdefaultOrbitedUri = ((uri.getProtocol() || baseUri.getProtocol())\n\t\t\t\t\t+ \"://\"\n\t\t\t\t\t+ (uri.getHost() || baseUri.getHost()) + \":\"\n\t\t\t\t\t+ (uri.getPort() || baseUri.getPort() || '80')\n\t\t\t\t\t+ (uri.getPath() || baseUri.getPath()));\n\t\t\tbreak;\n\t\t}\n\t}\n}\n\nsetup();\n\n// TCPSocket code\n\nvar READY_STATE = Enum({\n\tWAITING: -1,\n\tCONNECTING: 0,\n\tOPEN: 1,\n\tCLOSING: 2,\n\tCLOSED: 3\n});\n\nexports.TCPSocket=__class__;exports.TCPSocket=exports.TCPSocket(function exports_TCPSocket(){return this.init&&this.init.apply(this,arguments)},function() {\n\t\n\tthis.init = function(opts) {\n\t\tthis._orbitedUri  = opts.orbitedUri || defaultOrbitedUri;\n\t\tthis._orbitedBrowserLogLevel = opts.browserLogLevel || defaultBrowserLogLevel;\n\t\tif (!/\\/$/.test(this._orbitedUri)) {\n\t\t\tthis._orbitedUri += '/';\n\t\t}\n\t\tthis.readyState = READY_STATE.WAITING;\n\t\tthis._buffer = \"\";\n\t\tthis._forceTransport = opts.forceTransport;\n\t\tthis._sessionSupport = opts.sessionSupport || sessionSupport;\n\t\tlogger.setLevel( this._orbitedBrowserLogLevel )\n\t}\n\t\n\tthis.open = function(host, port, isBinary) {\n\t\tif (!this._orbitedUri) {\n\t\t\tthrow new Error(\"Could not automatically determine Orbited's uri, and Orbited.TCPSocket.opts.orbitedUri was not manually specified in TCPSocket constructor\");\n\t\t}\n\t\tvar multiplexer = getMultiplexer(this._orbitedUri, this._forceTransport, this);\n\t\t\n\t\tthis._isBinary = !!isBinary;\n\t\tthis._host = host;\n\t\tthis._port = port;\n\t\tthis._conn = multiplexer.openConnection();\n\t\tthis._conn.onOpen = bind(this, _onOpen);\n\t\tthis._conn.onFrame = bind(this, _onFrame);\n\t\tthis._conn.onClose = bind(this, _onClose);\n\t\tthis._connectionLost = bind(this, _onConnectionLost);\n\t\tthis.readyState = READY_STATE.CONNECTING;\n\t\t\n\t}\n\t\n\tvar _onConnectionLost = function(data) {\n\t\tbind(this, _trigger)('close', data);\n\t}\n\t\n\tvar _onClose = function(data) {\n\t\tif (this.readyState == READY_STATE.CLOSED) { return; }\n\t\tthis.readyState = READY_STATE.CLOSED;\n\t\tmultiplexer.connectionLost = multiplexer.onClose = function() {} // this would cause double errors\n\t\treleaseMultiplexer();\n\t\tbind(this, _trigger)('close',data);\n\t}\n\t\n\tvar _onOpen = function() {\n\t\tthis._conn.send(JSON.stringify({\n\t\t\thostname: this._host,\n\t\t\tport: this._port,\n\t\t\tprotocol: 'tcp'\n\t\t}));\n\t}\n\t\n\tvar _onFrame = function(payload) {\n\t\tswitch(this.readyState) {\n\t\t\tcase READY_STATE.CONNECTING:\n\t\t\t\tif (payload == '1') {\n\t\t\t\t\tthis.readyState = READY_STATE.OPEN;\n\t\t\t\t\tbind(this, _trigger)('open');\n\t\t\t\t\tif(this._sessionSupport) {\n\t\t\t\t\t\tthis._sessionKey = this._conn._multiplexer.transport._conn._sessionKey;\n\t\t\t\t\t}\n\t\t\t\t} else {\n\t\t\t\t\tthis._onClose();\n\t\t\t\t}\n\t\t\t\tbreak;\n\t\t\tcase READY_STATE.OPEN:\n\t\t\t\tthis._buffer += payload;\n\t\t\t\ttry{\n\t\t\t\t\tvar result = utf8.decode(this._buffer);\n\t\t\t\t}catch(e) {\n\t\t\t\t\tvar result = [this._buffer,this._buffer.length];\n\t\t\t\t}\n\t\t\t\tpayload= result[0];\n\t\t\t\tthis._buffer = this._buffer.slice(result[1]);\n\t\t\t\tif (payload.length) {\n\t\t\t\t\tbind(this, _trigger)('read', payload);\n\t\t\t\t}\n\t\t\t\tbreak;\n\t\t}\n\t}\n\t\n\tthis.send = function(data) {\n\t\tif (this.readyState >= READY_STATE.CLOSING) { return; }\n\t\tif (!this._isBinary) {\n\t\t\tdata = utf8.encode(data)\n\t\t}\n\t\tthis._conn.send(data);\n\t}\n\t\n\tthis.close = function() {\n\t\tif (this.readyState >= READY_STATE.CLOSING) { return; }\n\t\tthis.readyState = READY_STATE.CLOSING;\n\t\tthis._conn.close();\n\t\tthis._conn.onClose = bind(this, '_onClose');\n\t}\n\n\tvar _trigger = function(signal, data) {\n\t\t// TODO: use real signal handlers and real events\n\t\tvar fn = this['on' + signal];\n\t\tif (fn) {\n\t\t\tfn.call(this, data);\n\t\t}\n\t}\n});\n\n// WebSocket code\n\nexports.WebSocket=__class__;exports.WebSocket=exports.WebSocket(function exports_WebSocket(){return this.init&&this.init.apply(this,arguments)},function() {\n\t\n\tthis.init = function(url, protocol) {\n\t\t// TODO: what do we do with protocol?\n\t\tthis.URL = url;\n\t\tthis.readyState = READY_STATE.CONNECTING;\n\t\tthis.bufferedAmount = 0;\n\t\tvar multiplexer = getMultiplexer(exports.WebSocket.opts.orbitedUri, this);\n\t\tthis._conn = multiplexer.openConnection();\n\t\tthis._conn.onOpen = bind(this, _onOpen);\n\t\tthis._conn.onFrame = bind(this, _onFrame);\n\t\tthis._conn.onClose = bind(this, _onClose);\n\t\t\n\t\t// Callbacks\n\t\tthis.onclose = null;\n\t\tthis.onerror = null;\n\t\tthis.onmessage = null;\n\t\tthis.onopen = null;\n\t\t\n\t}\n\t\n\tthis.send = function(data) {\n\t\tif (this.readyState >= READY_STATE.CLOSING) { return; }\n\t\tdata = utf8.encode(data);\n\t\tthis._conn.send(data);\n\t}\n\t\n\tvar _onClose = function() {\n\t\tif (this.readyState == READY_STATE.CLOSED) { return; }\n\t\tthis.readyState = READY_STATE.CLOSED;\n\t\treleaseMultiplexer();\n\t\tbind(this, _trigger)('close');\n\t}\n\t\n\tvar _onOpen = function() {\n\t\tvar uri = new Uri(this.URL);\n\t\tthis._conn.send(JSON.stringify({\n\t\t\thostname: uri.getHost(),\n\t\t\tport: parseInt(uri.getPort()) || (uri.getProtocol() == 'ws' ? 80 : 443),\n\t\t\tpath: uri.getPath() || \"/\",\n\t\t\tprotocol: 'ws_' + exports.WebSocket.opts.protocolVersion\n\t\t}));\n\t}\n\t\n\tvar _onFrame = function(payload) {\n\t\tswitch(this.readyState) {\n\t\t\tcase READY_STATE.CONNECTING:\n\t\t\t\tif (payload == '1') {\n\t\t\t\t\tthis.readyState = READY_STATE.OPEN;\n\t\t\t\t\tbind(this, _trigger)('open');\n\t\t\t\t} else {\n\t\t\t\t\tthis._onClose();\n\t\t\t\t}\n\t\t\t\tbreak;\n\t\t\tcase READY_STATE.OPEN:\n\t\t\t\tvar result = utf8.decode(payload);\n\t\t\t\t// TODO: what about result[1] (leftover) ?\n\t\t\t\t// TODO: what about \"U+FFFD REPLACEMENT CHARACTER\" ?\n\t\t\t\tbind(this, _trigger)('message', result[0]);\n\t\t\t\tbreak;\n\t\t}\n\t}\n\t\n\tvar _trigger = function(signal, data) {\n\t\t// TODO: use real signal handlers and real events\n\t\tvar fn = this['on' + signal];\n\t\tif (fn) {\n\t\t\tfn.call(this, { data: data});\n\t\t}\n\t}\n\t\n\tthis.close = function() {\n\t\tif (this.readyState >= READY_STATE.CLOSING) { return; }\n\t\tthis.readyState = READY_STATE.CLOSING;\n\t\tthis._conn.close();\n\t\tthis._conn.onClose = bind(this, _onClose);\n\t}\n\t\n\t\n});\n\n\nvar installed = false;\nexports.WebSocket.install = function(opts) {\n\tif (installed) {\n\t\tthrow new Error(\"orbited.Websocket already installed\");\n\t}\n\tvalidateOpts(opts);\n\texports.WebSocket.opts = opts;\n\tinstalled = true;\n\tif (!opts.forceProxy && hasNativeWebSocket(opts.protocolVersion)) {\n\t\treturn;\n\t}\n\twindow.WebSocket = exports.WebSocket;\n\twindow.WebSocket.__original__ = originalWebSocket;\n}\n\nfunction validateOpts(opts) {\n\topts.protocolVersion = opts.protocolVersion || 'hixie76';\n\topts.forceProxy = !!opts.forceProxy;\n\tif (!opts.orbitedUri) {\n\t\topts.orbitedUri = defaultOrbitedUri;\n\t}\n\tif (!opts.orbitedUri) {\n\t\t\tthrow new Error(\"orbitedUri not specified; unable to auto-detect it based on script tag includes\");\n\t}\n\tif (!opts.orbitedUri.match('/$')) {\n\t\topts.orbitedUri += '/';\n\t}\n}\n\nfunction hasNativeWebSocket(rev) {\n\t// Actually detect different revisions. This could get complicated...\n\t\n\tif (!originalWebSocket) { return false; }\n\tif (!rev) { return true; }\n\tif (navigator.userAgent.match(\"Chrome/5\")) {\n\t\treturn rev == 'hixie75';\n\t}\n\tif (navigator.userAgent.match(\"Chrome/6\")) {\n\t\treturn rev == 'hixie76';\n\t}\n\tif (navigator.userAgent.match(\"Version/5\\.0 Safari\")) {\n\t\treturn rev == 'hixie75';\n\t}\n\t// unknown.. when in doubt, say no.\n\treturn false;\n}\n\n\n// Multiplexing Connection Code (shared between TCPSocket and WebSocket)\n\nvar multiplexer = null;\nvar count = 0;\n\nfunction getMultiplexer(baseUri, forceTransport, socket) {\n\tlogger.debug('getMultiplexer', baseUri, forceTransport);\n\tif (!multiplexer || multiplexer['url'] == null) {\n\t\tmultiplexer = new OrbitedMultiplexingProtocol(baseUri);\n\t\tmultiplexer._socket = socket; // we need a reference to the socket (i.e TCPSocket) to be able to send connectionlost events\n\t\tmultiplexer.onClose = function(reason) {\n\t\t\tmultiplexer = null;\n\t\t\tthis._socket._connectionLost(reason)\n\t\t}\n\t\t// TODO: Choose transport\n\t\tvar _transport = forceTransport;\n\t\tif (!_transport) {\n\t\t\tif (!!originalWebSocket) { _transport = 'ws'; }\n\t\t\telse { _transport = 'csp'; }\n\t\t}\n\t\tlogger.debug('_transport is', _transport);\n\t\tswitch(_transport) {\n\t\t\tcase 'ws':\n\t\t\t\tvar uri = new Uri(baseUri);\n\t\t\t\turi.setProtocol('ws');\n\t\t\t\tvar url = uri.toString() + 'ws';\n\t\t\t\tlogger.debug('connecting with ws')\n\t\t\t\tnet.connect(multiplexer, 'websocket', { url: url, wsConstructor: originalWebSocket });\n\t\t\t\tmultiplexer.connectionLost = bind(multiplexer, '_connectionLost', 'websocket');\n\t\t\t\tmultiplexer.mode = 'ws';\n\t\t\t\tbreak;\n\t\t\tcase 'csp':\n\t\t\t\tlogger.debug('connecting with csp')\n\t\t\t\tnet.connect(multiplexer, 'csp', { url: baseUri + 'csp' });\n\t\t\t\tmultiplexer.mode = 'csp';\n\t\t\t\tmultiplexer.connectionLost = bind(multiplexer, '_connectionLost', 'csp');\n\t\t\t\tbreak;\n\t\t}\n\t}\n\t\n\t++count;\n\treturn multiplexer;\n}\n\nfunction releaseMultiplexer() {\n\tif (--count == 0) {\n\t\t\n\t\tmultiplexer.transport.loseConnection();\n\t\tmultiplexer = null;\n\t}\n}\n\nvar FRAME = Enum({\n\t'OPEN': 0, \n\t'CLOSE': 1, \n\t'DATA': 2\n});\nDELIMITER = ',';\n\nConnection=__class__;var Connection=Connection(function Connection(){return this.init&&this.init.apply(this,arguments)},function() {\n\t\n\tthis.init = function(multiplexer, id) {\n\t\tthis._multiplexer = multiplexer;\n\t\tthis._id = id;\n\t}\n\t\n\tthis.send = function(data) {\n\t\t// this._id = id; \n\t\tthis._multiplexer.sendFrame(this._id, FRAME.DATA, data);\n\t}\n\tthis.close = function() {\n\t\tthis._multiplexer.closeConnection(this._id);\n\t}\n\t\n\tthis.onFrame = function(data) { }\n\tthis.onClose = function(code) {}\n\tthis.onOpen = function() {}\n\t\n});\n\n\n\nOrbitedMultiplexingProtocol=__class__;var OrbitedMultiplexingProtocol=OrbitedMultiplexingProtocol(function OrbitedMultiplexingProtocol(){return this.init&&this.init.apply(this,arguments)},BufferedProtocol, function(supr) {\n\t\n\tthis.init = function(baseUri) {\n\t\tsupr(this, 'init', arguments);\n\t\tthis._baseUri = baseUri;\n\t\tthis._connections = {};\n\t\tthis._last_id = -1;\n\t\tthis._size = -1;\n\t\tthis._connected = false;\n\t}\n\n\tthis.openConnection = function() {\n\t\tlogger.debug('opening multiplexing connection');\n\t\tvar id = ++this._last_id;\n\t\tvar conn = this._connections[id] = new Connection(this, id);\n\t\tif (this._connected) {\n\t\t\tlogger.debug('already opened, triggering now');\n\t\t\tthis._sendOpen(id);\n\t\t}\n\t\treturn conn;\n\t}\n\tthis.closeConnection = function(id) {\n\t\tvar conn = this._connections[id];\n\t\tif (!conn) { return; }\n\t\tif (this._connected) {\n\t\t\tthis._sendClose(id);\n\t\t}\n\t}\n\tthis._sendOpen = function(id) {\n\t\tlogger.debug('_sendOpen', id, FRAME.OPEN);\n\t\tKKK = FRAME;\n\t\tJJJ = FRAME.OPEN;\n\t\tthis.sendFrame(id, FRAME.OPEN);\n\t}\n\tthis._sendClose = function(id) {\n\t\tthis.sendFrame(id, FRAME.CLOSE);\n\t}\n\n\tthis.sendFrame = function(id, type, payload) {\n\t\tpayload = payload || \"\";\n\t\tif (!this._connected) {\n\t\t\tthrow new Error(\"Multiplexer not connected\");\n\t\t}\n\t\tvar idPayload = id + DELIMITER + type + DELIMITER + payload;\n\t\tvar frame = idPayload.length + DELIMITER + idPayload;\n\t\tlogger.debug('frame:', frame, 'id:', id, 'type:', type, 'payload:', payload);\n\t\tthis.transport.write(frame);\n\t}\n\t\n\tthis.connectionMade = function() {\n\t\tlogger.debug('connectionMade on multiplexer');\n\t\tthis._connected = true;\n//\t\tthis.transport.setEncoding('plain');\n\t\tfor (id in this._connections) {\n\t\t\tthis._sendOpen(id);\n\t\t}\n\t}\n\t\n\t//callback \n\tthis.onClose = function() { \n\t\t\n\t}\n\n\tthis._connectionLost = function(transportName, reason, wasConnected) {\n\t\tif (!wasConnected) {\n\t\t\tif (transportName == 'websocket') {\n\t\t\t\tnet.connect(this, 'csp', {url: this._baseUri + 'csp' });\n\t\t\t\tthis.connectionLost = bind(this, '_connectionLost', 'csp');\n\t\t\t\tthis.mode = 'csp';\n\t\t\t}else{\n\t\t\t\tthis.onClose(transportName);\n\t\t\t}\n\t\t} else {\n\t\t\tthis.onClose(transportName);\n\t\t}\n\t}\n\n\tthis._dispatchPayload = function(payload) {\n\t\tvar i = payload.indexOf(DELIMITER);\n\t\tif (i == -1) { return; } // ERR \n\t\tvar id = parseInt(payload.substring(0,i))\n\t\tvar j = payload.indexOf(DELIMITER, i+1);\n\t\tif (j == -1) { return; } // ERR \n\t\tvar frameType = parseInt(payload.substring(i+1,j));\n\t\tvar data = payload.substring(j+1);\n\t\tvar conn = this._connections[id];\n\t\tif (!conn || typeof(frameType) != 'number') {\n\t\t\treturn; // ERR\n\t\t}\n\t\t\n\t\tswitch(frameType) {\n\t\t\tcase FRAME.OPEN:\n\t\t\t\tconn.onOpen();\n\t\t\t\tbreak;\n\t\t\tcase FRAME.CLOSE:\n\t\t\t\tdelete this._connections[id];\n\t\t\t\tconn.onClose(data);\n\t\t\t\tbreak;\n\t\t\tcase FRAME.DATA:\n\t\t\t\tconn.onFrame(data);\n\t\t\t\tbreak;\n\t\t}\n\t}\n\t\n\tthis.bufferUpdated = function() {\n\t\twhile (true) {\n\t\t\tif (this._size == -1) {\n\t\t\t\tif (this.buffer.hasDelimiter(DELIMITER)) {\n\t\t\t\t\tthis._size = parseInt(this.buffer.consumeToDelimiter(DELIMITER));\n\t\t\t\t\tthis.buffer.consumeBytes(DELIMITER.length);\n\t\t\t\t} else {\n\t\t\t\t\t// Wait for delimiter\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t}\n\t\t\t\n\t\t\tif (!this.buffer.hasBytes(this._size)) {\n\t\t\t\t// Wait for more bytes\n\t\t\t\tbreak;\n\t\t\t}\n\t\t\t\n\t\t\tvar payload = this.buffer.consumeBytes(this._size);\n\t\t\tthis._dispatchPayload(payload);\n\t\t\tthis._size = -1;\n\t\t}\n\t}\n});\n\nOrbited2 = exports","friendlyPath":".Orbited2","pre":true},"/home/niklas/js.io/packages/net/protocols/buffered.js":{"path":"/home/niklas/js.io/packages/net/protocols/buffered.js","directory":"/home/niklas/js.io/packages/net/protocols/","filename":"buffered.js","baseMod":"net","basePath":"/home/niklas/js.io/packages/","src":"jsio('from net.interfaces import Protocol');\njsio('from net.buffer import Buffer');\n\n/**\n * @extends net.interfaces.Protocol\n */\nexports.BufferedProtocol=__class__;exports.BufferedProtocol=exports.BufferedProtocol(function exports_BufferedProtocol(){return this.init&&this.init.apply(this,arguments)},Protocol, function(supr) {\n\n\tthis.init = function() {\n\t\tthis.buffer = new Buffer();\n\t}\n\n\t// Overwrite this instead of dataReceived in base classes\n\tthis.bufferUpdated = function() {}\n\n\tthis.dataReceived = function(data) {\n\t\tthis.buffer.append(data);\n\t\tthis.bufferUpdated();\n\t}\n\n})","friendlyPath":"net.protocols.buffered","pre":true},"/home/niklas/js.io/packages/net/interfaces.js":{"path":"/home/niklas/js.io/packages/net/interfaces.js","directory":"/home/niklas/js.io/packages/net/","filename":"interfaces.js","src":"// Sort of like a twisted protocol\njsio('import net');\njsio('import lib.Enum as Enum');\n\nvar ctx = jsio.__env.global;\n\nexports.Protocol=__class__;exports.Protocol=exports.Protocol(function exports_Protocol(){return this.init&&this.init.apply(this,arguments)},function() {\n\tthis.connectionMade = function(isReconnect) {}\n\tthis.dataReceived = function(data) {}\n\tthis.connectionLost = function(reason) {}\n\t\n\tthis._connectionMade = function() {\n\t\tthis._isConnected = true;\n\t\tthis.connectionMade.apply(this, arguments);\n\t}\n\n\tthis._connectionLost = function() {\n\t\tthis._isConnected = true;\n\t\tthis.connectionLost.apply(this, arguments);\n\t}\n\n\tthis._isConnected = false;\n\tthis.isConnected = function() {\n\t\treturn !!this._isConnected;\n\t}\n\t\n\t\n});\n\nexports.Client=__class__;exports.Client=exports.Client(function exports_Client(){return this.init&&this.init.apply(this,arguments)},function() {\n\tthis.init = function(protocol) {\n\t\tthis._protocol = protocol;\n\t}\n\t\n\tthis.connect = function(transportName, opts) {\n\t\tthis._remote = new this._protocol();\n\t\tthis._remote._client = this;\n\t\tnet.connect(this._remote, transportName, opts);\n\t}\n});\n\n// Sort of like a twisted factory\nexports.Server=__class__;exports.Server=exports.Server(function exports_Server(){return this.init&&this.init.apply(this,arguments)},function() {\n\tthis.init = function(protocolClass) {\n\t\tthis._protocolClass = protocolClass;\n\t}\n\n\tthis.buildProtocol = function() {\n\t\treturn new this._protocolClass();\n\t}\n\t\n\tthis.listen = function(how, port) {\n\t\treturn net.listen(this, how, port);\n\t}\n});\n\nexports.Transport=__class__;exports.Transport=exports.Transport(function exports_Transport(){return this.init&&this.init.apply(this,arguments)},function() {\n\tthis._encoding = 'plain'\n\tthis.write = function(data, encoding) {\n\t\tthrow new Error(\"Not implemented\");\n\t}\n\tthis.getPeer = function() {\n\t\tthrow new Error(\"Not implemented\");\n\t}\n\tthis.setEncoding = function(encoding) {\n\t\tthis._encoding = encoding;\n\t}\n\tthis.getEncoding = function() {\n\t\treturn this._encoding;\n\t}\n});\n\nexports.Listener=__class__;exports.Listener=exports.Listener(function exports_Listener(){return this.init&&this.init.apply(this,arguments)},function() {\n\tthis.init = function(server, opts) {\n\t\tthis._server = server;\n\t\tthis._opts = opts || {};\n\t}\n\t\n\tthis.onConnect = function(transport) {\n//\t\ttry {\n\t\t\tvar p = this._server.buildProtocol();\n\t\t\tp.transport = transport;\n\t\t\tp.server = this._server;\n\t\t\ttransport.protocol = p;\n\t\t\ttransport.makeConnection(p);\n\t\t\tp._connectionMade();\n//\t\t} catch(e) {\n//\t\t\tlogger.error(e);\n//\t\t}\n\t}\n\t\n\tthis.listen = function() { throw new Error('Abstract class'); }\n\tthis.stop = function() {}\n});\n\nexports.STATE = Enum('INITIAL', 'DISCONNECTED', 'CONNECTING', 'CONNECTED');\nexports.Connector=__class__;exports.Connector=exports.Connector(function exports_Connector(){return this.init&&this.init.apply(this,arguments)},function() {\n\tthis.init = function(protocol, opts) {\n\t\tthis._protocol = protocol;\n\t\tthis._opts = opts;\n\t\tthis._state = exports.STATE.INITIAL;\n\t}\n\t\n\tthis.getState = function() { return this._state; }\n\t\n\tthis.onConnect = function(transport) {\n\t\tthis._state = exports.STATE.CONNECTED;\n\n\t\ttransport.makeConnection(this._protocol);\n\t\tthis._protocol.transport = transport;\n\t\ttry {\n\t\t\tthis._protocol._connectionMade();\n\t\t} catch(e) {\n\t\t\tthrow logger.error(e);\n\t\t}\n\t}\n\t\n\tthis.onDisconnect = function(err) {\n\t\tvar wasConnected = this._state == exports.STATE.CONNECTED;\n\t\tthis._state = exports.STATE.DISCONNECTED;\n\t\t\n\t\ttry {\n\t\t\tthis._protocol._connectionLost(err, wasConnected);\n\t\t} catch(e) {\n\t\t\tthrow logger.error(e);\n\t\t}\n\t}\n\t\n\tthis.getProtocol = function() { return this._protocol; }\n});\n","friendlyPath":"net.interfaces","pre":true},"/home/niklas/js.io/packages/net.js":{"path":"/home/niklas/js.io/packages/net.js","directory":"/home/niklas/js.io/packages/","filename":"net.js","src":"jsio('import net.env');\njsio('import std.JSON as JSON');\n\nJSON.createGlobal(); // create the global JSON object if it doesn't already exist\n\n/**\n * @namespace\n */\n\nexports.listen = function(server, transportName, opts) {\n\tif (!transportName) {\n\t\tthrow logger.error('No transport provided for net.listen');\n\t}\n\t\n\tvar ctor = typeof transportName == 'string' ? net.env.getListener(transportName) : transportName,\n\t\tlistener = new ctor(server, opts);\n\t\n\tlistener.listen();\n\treturn listener;\n}\n\nexports.connect = function(protocolInstance, transportName, opts) {\n\tvar ctor = typeof transportName == 'string' ? net.env.getConnector(transportName) : transportName,\n\t\tconnector = new ctor(protocolInstance, opts);\n\tconnector.connect();\n\treturn connector;\n}\n\nexports.quickServer = function(protocolClass) {\n\tjsio('import net.interfaces');\n\treturn new net.interfaces.Server(protocolClass);\n}\n","friendlyPath":"net","pre":true},"/home/niklas/js.io/packages/net/env.js":{"path":"/home/niklas/js.io/packages/net/env.js","directory":"/home/niklas/js.io/packages/net/","filename":"env.js","src":"function getObj(objectName, transportName, envName) {\n\t\n\ttry {\n\t\tvar DYNAMIC_IMPORT_ENV = 'from .env.' + (envName || jsio.__env.name) + '.' + transportName + ' import ' + objectName + ' as result';\n\t\tjsio(DYNAMIC_IMPORT_ENV);\n\t} catch(e) {\n\t\tthrow logger.error('Invalid transport (', transportName, ') or environment (', envName, ')');\n\t}\n\treturn result;\n}\n\nexports.getListener = bind(this, getObj, 'Listener');\nexports.getConnector = bind(this, getObj, 'Connector');\n","friendlyPath":"net.env","pre":true},"/home/niklas/js.io/packages/net/env/browser/csp.js":{"path":"/home/niklas/js.io/packages/net/env/browser/csp.js","directory":"/home/niklas/js.io/packages/net/env/browser/","filename":"csp.js","src":"jsio('import net.interfaces');\njsio('from net.csp.client import CometSession');\njsio('import std.utf8 as utf8');\n\n/**\n * @extends net.interfaces.Connector\n */\nexports.Connector=__class__;exports.Connector=exports.Connector(function exports_Connector(){return this.init&&this.init.apply(this,arguments)},net.interfaces.Connector, function() {\n\tthis.connect = function() {\n\t\tthis._state = net.interfaces.STATE.CONNECTING;\n\t\t\n\t\tvar conn = new CometSession();\n\t\tconn.onconnect = bind(this, 'cometSessionOnConnect', conn);\n\t\tconn.ondisconnect = bind(this, 'onDisconnect');\n\t\t\n\t\tlogger.debug('opening the connection');\n\t\tif (!this._opts.encoding) { this._opts.encoding = 'plain'; }\n\t\tconn.connect(this._opts.url, this._opts);//{encoding: 'plain'});\n\t}\n\t\n\tthis.cometSessionOnConnect = function(conn) {\n\t\tlogger.debug('conn has opened');\n\t\tthis.onConnect(new Transport(conn));\n\t}\n});\n\nTransport=__class__;var Transport=Transport(function Transport(){return this.init&&this.init.apply(this,arguments)},net.interfaces.Transport, function() {\n\tthis.init = function(conn) {\n\t\tthis._conn = conn;\n\t}\n\t\n\tthis.makeConnection = function(protocol) {\n\t\tthis._conn.onread = bind(protocol, 'dataReceived');\n\t}\n\t\n\tthis.write = function(data) {\n\t\tthis._conn.write(data);\n\t}\n\t\n\tthis.loseConnection = function(protocol) {\n\t\tthis._conn.close();\n\t}\n});\n","friendlyPath":"net.env.browser.csp","pre":true},"/home/niklas/js.io/packages/net/csp/client.js":{"path":"/home/niklas/js.io/packages/net/csp/client.js","directory":"/home/niklas/js.io/packages/net/csp/","filename":"client.js","src":"jsio('import std.base64 as base64');\njsio('import std.utf8 as utf8');\njsio('import std.uri as uri'); \njsio('import net.errors as errors');\njsio('import .transports');\njsio('import lib.Enum as Enum');\njsio('from util.browserdetect import BrowserDetect');\n\nvar READYSTATE = exports.READYSTATE = Enum({\n\tINITIAL: 0,\n\tCONNECTING: 1,\n\tCONNECTED: 2,\n\tDISCONNECTING: 3,\n\tDISCONNECTED:  4\n});\n\n\nexports.CometSession=__class__;exports.CometSession=exports.CometSession(function exports_CometSession(){return this.init&&this.init.apply(this,arguments)},function(supr) {\n\tvar id = 0;\n\tvar kDefaultBackoff = 50;\n\tvar kDefaultTimeoutInterval = 45000;\n\tvar kDefaultHandshakeTimeout = 10000;\n\tthis.init = function() {\n\t\tthis._id = ++id;\n\t\tthis._url = null;\n\t\tthis.readyState = READYSTATE.INITIAL;\n\t\tthis._sessionKey = null;\n\t\tthis._transport = null;\n\t\tthis._options = null;\n\t\t\n\t\tthis._utf8ReadBuffer = \"\";\n\t\tthis._writeBuffer = \"\";\n\t\t\n\t\tthis._packetsInFlight = null;\n\t\tthis._lastEventId = null;\n\t\tthis._lastSentId = null;\n\t\t\n\t\tthis._handshakeLater = null;\n\t\tthis._handshakeBackoff = kDefaultBackoff;\n\t\tthis._handshakeRetryTimer = null;\n\t\tthis._handshakeTimeoutTimer = null;\n\n\t\tthis._timeoutTimer = null;\n\n\t\t\n\t\tthis._writeBackoff = kDefaultBackoff;\n\t\tthis._cometBackoff = kDefaultBackoff;\n\t\t\n\t\tthis._nullInBuffer = false;\n\t\tthis._nullInFlight= false;\n\t\tthis._nullSent = false;\n\t\tthis._nullReceived = false;\n\t\t\n\t\tthis._maxWriteLength = -1;\n\t\t\n\t\tif( BrowserDetect.isIE ) {\n\t\t\tthis._maxWriteLength = 1900; // IE don't like packages over 2048, let's play it safe and set to 1900\n\t\t\t\t\t\t\t\t\t\t // TODO: Max length could differ depending on transport\n\t\t}\n\t}\n\t\n\t\n\tthis.setEncoding = function(encoding) {\n\t\tif (encoding == this._options.encoding) { \n\t\t\treturn; \n\t\t}\n\t\tif (encoding != 'utf8' && encoding != 'plain') {\n\t\t\tthrow new errors.InvalidEncodingError();\n\t\t}\n\t\tif (encoding == 'plain' && this._buffer) {\n\t\t\tvar buffer = this._utf8ReadBuffer;\n\t\t\tthis._utf8ReadBuffer = \"\";\n\t\t\tthis._doOnRead(buffer);\n\t\t}\n\t\tthis._options.encoding = encoding;\n\t}\n\n\n\tthis.connect = function(url, options) {\n\t\tthis._url = url.replace(/\\/$/,'');\n\t\tthis._options = options || {};\n\t\t\n\t\tthis._options.encoding = this._options.encoding || 'utf8';\n\t\tthis.setEncoding(this._options.encoding); // enforce encoding constraints\n\t\t\n\t\tthis._options.connectTimeout = this._options.connectTimeout || kDefaultHandshakeTimeout;\n\t\t\n\t\tvar transportClass = transports.chooseTransport(url, this._options);\n\t\tthis._transport = new transportClass();\n\t\t\n\t\tthis._transport.handshakeFailure = bind(this, this._handshakeFailure);\n\t\tthis._transport.handshakeSuccess = bind(this, this._handshakeSuccess);\n\t\t\n\t\tthis._transport.cometFailure = bind(this, this._cometFailure);\n\t\tthis._transport.cometSuccess = bind(this, this._cometSuccess);\n\t\t\n\t\tthis._transport.sendFailure = bind(this, this._writeFailure);\n\t\tthis._transport.sendSuccess = bind(this, this._writeSuccess);\n\t\tthis.readyState = READYSTATE.CONNECTING;\n\t\tthis._transport.handshake(this._url, this._options);\n\t\t\n\t\tthis._handshakeTimeoutTimer = setTimeout(bind(this, this._handshakeTimeout), \n\t\t\tthis._options.connectTimeout);\n\t}\n\n\tthis.write = function(data, encoding) {\n\t\tif (this.readyState != READYSTATE.CONNECTED) {\n\t\t\tthrow new errors.ReadyStateError();\n\t\t}\n\t\tencoding = encoding || this._options.encoding || 'utf8';\n\t\tif (encoding == 'utf8') {\n\t\t\tdata = utf8.encode(data);\n\t\t}\n\t\tthis._writeBuffer += data;\n\t\tthis._doWrite();\n\t}\n\t\n\t// Close due to protocol error\n\tthis._protocolError = function(msg) {\n\t\tlogger.debug('_protocolError', msg);\n\t\t// Immediately fire the onclose\n\t\t// send a null packet to the server\n\t\t// don't wait for a null packet back.\n\t\tthis.readyState = READYSTATE.DISCONNECTED;\n\t\tthis._doWrite(true);\n\t\tthis._doOnDisconnect(new errors.ServerProtocolError(msg));\n\t}\n\t\n\tthis._receivedNullPacket = function() {\n\t\tlogger.debug('_receivedNullPacket');\n\t\t// send a null packet back to the server\n\t\tthis._receivedNull = true;\n\t\t\n\t\t// send our own null packet back. (maybe)\n\t\tif (!(this._nullInFlight || this._nullInBuffer || this._nullSent)) {\n\t\t\tthis.readyState = READYSTATE.DISCONNECTING;\n\t\t\tthis._doWrite(true);\n\t\t}\n\t\telse {\n\t\t\tthis.readyState = READYSTATE.DISCONNECTED;\n\t\t}\n\t\t\n\t\t// fire an onclose\n\t\tthis._doOnDisconnect(new errors.ConnectionClosedCleanly());\n\n\t}\n\t\n\tthis._sentNullPacket = function() {\n\t\tlogger.debug('_sentNullPacket');\n\t\tthis._nullSent = true;\n\t\tif (this._nullSent && this._nullReceived) {\n\t\t\tthis.readyState = READYSTATE.DISCONNECTED;\n\t\t}\n\t}\n\t\n\t\n\t// User Calls close\n\tthis.close = function(err) {\n\t\tlogger.debug('close called', err, 'readyState', this.readyState);\n\n\t\t// \n\t\tswitch(this.readyState) {\n\t\t\tcase READYSTATE.CONNECTING:\n\t\t\t\tclearTimeout(this._handshakeRetryTimer);\n\t\t\t\tclearTimeout(this._handshakeTimeoutTimer);\n\t\t\t\tthis.readyState = READYSTATE.DISCONNECTED;\n\t\t\t\tthis._doOnDisconnect(err);\n\t\t\t\tbreak;\n\t\t\tcase READYSTATE.CONNECTED:\n\t\t\t\tthis.readyState = READYSTATE.DISCONNECTING;\n\t\t\t\tthis._doWrite(true);\n\t\t\t\tclearTimeout(this._timeoutTimer);\n\t\t\t\tbreak;\n\t\t\tcase READYSTATE.DISCONNECTED:\n\t\t\t\tthrow new errors.ReadyStateError(\"Session is already disconnected\");\n\t\t\t\tbreak;\n\t\t}\n\t\t\n\t\t\n\t\tthis._opened = false; // what is this used for???\n\t\tthis.readyState = READYSTATE.DISCONNECTED;\n\t\t\n\t\tthis._doOnDisconnect(err);\n\t\tthis._sessionKey = null;\n\t}\n\t\n\tthis._handshakeTimeout = function() {\n\t\tlogger.debug('handshake timeout');\n\t\tthis._handshakeTimeoutTimer = null;\n\t\tclearTimeout(this._handshakeRetryTimer);\n\t\tif (this.readyState == READYSTATE.CONNECTING) {\n\t\t\tthis.readyState = READYSTATE.DISCONNECTED;\n\t\t}\n\t\t\n\t\tthis._doOnDisconnect(new errors.ServerUnreachable());\n\t}\n\t\n\tthis._handshakeSuccess = function(data) {\n\t\tlogger.debug('handshake success', data);\n\t\tif (this.readyState != READYSTATE.CONNECTING) { \n\t\t\tlogger.debug('received handshake success in invalid readyState:', this.readyState);\n\t\t\treturn; \n\t\t}\n\t\tclearTimeout(this._handshakeTimeoutTimer);\n\t\tthis._handshakeTimeoutTimer = null;\n\t\tthis._sessionKey = data.response.session;\n\t\tthis._opened = true;\n\t\tthis.readyState = READYSTATE.CONNECTED;\n\t\tthis._doOnConnect();\n\t\tthis._doConnectComet();\n\t}\n\t\n\tthis._handshakeFailure = function(data) {\n\t\tlogger.debug('handshake failure', data);\n\t\tif (this.readyState != READYSTATE.CONNECTING) { return; }\n\t\tif (data.status == 404) {\n\t\t\tclearTimeout(this._handshakeTimeoutTimer);\n\t\t\treturn this._doOnDisconnect(new errors.ServerUnreachable());\n\t\t}\n\t\t\n\t\tlogger.debug('trying again in ', this._handshakeBackoff);\n\t\tthis._handshakeRetryTimer = setTimeout(bind(this, function() {\n\t\t\tthis._handshakeRetryTimer = null;\n\t\t\tthis._transport.handshake(this._url, this._options);\n\t\t}), this._handshakeBackoff);\n\t\t\n\t\tthis._handshakeBackoff *= 2;\n\t}\n\t\n\tthis._writeSuccess = function() {\n\t\tif (this.readyState != READYSTATE.CONNECTED && this.readyState != READYSTATE.DISCONNECTING) {\n\t\t\treturn;\n\t\t}\n\t\tif (this._nullInFlight) {\n\t\t\treturn this._sentNullPacket();\n\t\t}\n\t\tthis._resetTimeoutTimer();\n\t\tthis.writeBackoff = kDefaultBackoff;\n\t\tthis._packetsInFlight = null;\n\t\tif (this._writeBuffer || this._nullInBuffer) {\n\t\t\tthis._doWrite(this._nullInBuffer);\n\t\t}\n\t}\n\t\n\tthis._writeFailure = function() {\n\t\tif (this.readyState != READYSTATE.CONNECTED && this.READYSTATE != READYSTATE.DISCONNECTING) { return; }\n\t\tthis._writeTimer = setTimeout(bind(this, function() {\n\t\t\tthis._writeTimer = null;\n\t\t\tthis.__doWrite(this._nullInBuffer);\n\t\t}), this._writeBackoff);\n\t\tthis._writeBackoff *= 2;\n\t}\t\n\n\tthis._doWrite = function(sendNull) {\n\t\tif (this._packetsInFlight) {\n\t\t\tif (sendNull) {\n\t\t\t\tthis._nullInBuffer = true;\n\t\t\t\treturn; \n\t\t\t}\n\t\t\treturn;\n\t\t}\n\t\tthis.__doWrite(sendNull);\n\t}\n\t\n\tthis.__doWrite = function(sendNull) {\n\t\tlogger.debug('_writeBuffer:', this._writeBuffer);\n\t\tif (!this._packetsInFlight && this._writeBuffer) {\n\t\t\tif ( this._maxWriteLength !== -1 && this._writeBuffer.length > this._maxWriteLength  )  {  \n\t\t\t\t_parts = this._writeBuffer.match(/.{1,1900}/g);\n\t\t\t\tthis._writeBuffer     = _parts.shift();\n\t\t\t\tthis._packetsInFlight = [this._transport.encodePacket(++this._lastSentId, this._writeBuffer, this._options)];\n\t\t\t\tthis._writeBuffer     = _parts.join('');\n\t\t\t}else{\n\t\t\t\tthis._packetsInFlight = [this._transport.encodePacket(++this._lastSentId, this._writeBuffer, this._options)];\n\t\t\t\tthis._writeBuffer = \"\";\n\t\t\t}\n\t\t}\n\t\tif (sendNull && !this._writeBuffer) {\n\t\t\tif (!this._packetsInFlight) {\n\t\t\t\tthis._packetsInFlight = [];\n\t\t\t}\n\t\t\tthis._packetsInFlight.push([++this._lastSentId, 0, null]);\n\t\t\tthis._nullInFlight = true;\n\t\t}\n\t\tif (!this._packetsInFlight) {\n\t\t\tlogger.debug(\"no packets to send\");\n\t\t\treturn;\n\t\t}\n\t\tlogger.debug('sending packets:', JSON.stringify(this._packetsInFlight));\n\t\tthis._transport.send(this._url, this._sessionKey, this._lastEventId || 0, JSON.stringify(this._packetsInFlight), this._options);\n\t}\n\t\n\tthis._doConnectComet = function() {\n\t\tlogger.debug('_doConnectComet');\n//\t\treturn;\n\t\tthis._transport.comet(this._url, this._sessionKey, this._lastEventId || 0, this._options);\n\t}\n\n\tthis._cometFailure = function(data) {\n\t\tif (this.readyState != READYSTATE.CONNECTED) { return; }\n\t\tif (data.status == 404 && data.response == 'Session not found') {\n\t\t\treturn this.close(new errors.ExpiredSession(data));\n\t\t}\n\t\t\n\t\tthis._cometTimer = setTimeout(bind(this, '_doConnectComet'), this._cometBackoff);\n\t\tthis._cometBackoff *= 2;\n\t}\n\t\n\tthis._cometSuccess = function(data) {\n\t\tif (this.readyState != READYSTATE.CONNECTED && this.readyState != READYSTATE.DISCONNECTING) { return; }\n\t\tlogger.debug('comet Success:', data);\n\t\tthis._cometBackoff = kDefaultBackoff;\n\t\tthis._resetTimeoutTimer();\n\t\t\n\t\tvar response = data.response;\n\t\tfor (var i = 0, packet; (packet = response[i]) || i < response.length; i++) {\n\t\t\tlogger.debug('process packet:', packet);\n\t\t\tif (packet === null) {\n\t\t\t\treturn this.close(new errors.ServerProtocolError(data));\n\t\t\t}\n\t\t\tlogger.debug('process packet', packet);\n\t\t\tvar ackId = packet[0];\n\t\t\tvar encoding = packet[1];\n\t\t\tvar data = packet[2];\n\t\t\tif (typeof(this._lastEventId) == 'number' && ackId <= this._lastEventId) {\n\t\t\t\tcontinue;\n\t\t\t}\n\t\t\tif (typeof(this._lastEventId) == 'number' && ackId != this._lastEventId+1) {\n\t\t\t\treturn this._protocolError(\"Ack id too high\");\n\t\t\t}\n\t\t\tthis._lastEventId = ackId;\n\t\t\tif (data == null) {\n\t\t\t\treturn this._receivedNullPacket();\n\t\t\t}\n\t\t\tif (encoding == 1) { // base64 encoding\n\t\t\t\ttry {\n\t\t\t\t\tlogger.debug('before base64 decode:', data);\n\t\t\t\t\tdata = base64.decode(data);\n\t\t\t\t\tlogger.debug('after base64 decode:', data);\n\t\t\t\t} catch(e) {\n\t\t\t\t\treturn this._protocolError(\"Unable to decode base64 payload\");\n\t\t\t\t}\n\t\t\t}\n\t\t\tif (this._options.encoding == 'utf8') {\n\t\t\t\t// TODO: need an incremental utf8 decoder for this stuff.\n\t\t\t\tthis._utf8ReadBuffer += data;\n\t\t\t\tlogger.debug('before utf8 decode, _utf8ReadBuffer:', this._utf8ReadBuffer);\n\t\t\t\tvar result = utf8.decode(this._utf8ReadBuffer);\n\t\t\t\tdata = result[0];\n\t\t\t\tthis._utf8ReadBuffer = this._utf8ReadBuffer.slice(result[1]);\n\t\t\t\tlogger.debug('after utf8 decode, _utf8ReadBuffer:', this._utf8ReadBuffer, 'data:', data );\n\t\t\t}\n\t\t\tlogger.debug('dispatching data:', data);\n\n\t\t\t// TODO: possibly catch this error in production? but not in dev\n\t\t\ttry{\n    \t\t\tthis._doOnRead(data);\n\t\t\t}catch(e){\n\t\t\t    logger.warn(e);\n\t\t\t}\n\t\t}\n\t\t\n\t\tif (this.readyState != READYSTATE.CONNECTED && this.readyState != READYSTATE.DISCONNECTING) { return; }\n\t\t\n\t\t// reconnect comet last, after we process all of the packet ids\n\t\tthis._doConnectComet();\n\t\t\n\t}\n\n\tthis._doOnRead = function(data) {\n\t\tif (typeof(this.onread) == 'function') {\n\t\t\tlogger.debug('call onread function', data);\n\t\t\tthis.onread(data);\n\t\t}\n\t\telse {\n\t\t\tlogger.debug('skipping onread callback (function missing)');\n\t\t}\n\t}\n\t\n\tthis._doOnDisconnect = function(err) {\n\t\tif (typeof(this.ondisconnect) == 'function') {\n\t\t\tlogger.debug('call ondisconnect function', err);\n\t\t\tthis.ondisconnect(err);\n\t\t}\n\t\telse {\n\t\t\tlogger.debug('skipping ondisconnect callback (function missing)');\n\t\t}\n\t}\n\t\n\tthis._doOnConnect = function() {\n\t\tif (typeof(this.onconnect) == 'function') {\n\t\t\tlogger.debug('call onconnect function');\n\t\t\ttry {\n\t\t\t\tthis.onconnect();\n\t\t\t} catch(e) {\n\t\t\t\tlogger.debug('onconnect caused errror', e);\n\t\t\t\t// throw error later\n\t\t\t\tsetTimeout(function() { throw e }, 0);\n\t\t\t}\n\t\t}\n\t\telse {\n\t\t\tlogger.debug('skipping onconnect callback (function missing)');\n\t\t}\n\t}\n\n\tthis._resetTimeoutTimer = function() {\n\t\tclearTimeout(this._timeoutTimer);\n\t\tthis._timeoutTimer = setTimeout(bind(this, function() {\n\t\t\tlogger.debug('connection timeout expired');\n\t\t\tthis.close(new errors.ConnectionTimeout())\n\t\t}), this._getTimeoutInterval())\n\t}\n\t\n\tthis._getTimeoutInterval = function() {\n\t\treturn kDefaultTimeoutInterval;\n\t}\n\n});\n","friendlyPath":"net.csp.client","pre":true},"/home/niklas/js.io/packages/std/base64.js":{"path":"/home/niklas/js.io/packages/std/base64.js","directory":"/home/niklas/js.io/packages/std/","filename":"base64.js","baseMod":"std","basePath":"/home/niklas/js.io/packages/","src":"/**\n *\n *  Base64 encode / decode\n *  http://www.webtoolkit.info/\n *\n **/\n \nvar Base64 = {\n \n    // private property\n    _keyStr : \"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=\",\n \n    // public method for encoding\n    encode : function (input) {\n\tvar output = \"\";\n\tvar chr1, chr2, chr3, enc1, enc2, enc3, enc4;\n\tvar i = 0;\n \n\tinput = Base64._utf8_encode(input);\n \n\twhile (i < input.length) {\n \n\t    chr1 = input.charCodeAt(i++);\n\t    chr2 = input.charCodeAt(i++);\n\t    chr3 = input.charCodeAt(i++);\n \n\t    enc1 = chr1 >> 2;\n\t    enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);\n\t    enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);\n\t    enc4 = chr3 & 63;\n \n\t    if (isNaN(chr2)) {\n\t\tenc3 = enc4 = 64;\n\t    } else if (isNaN(chr3)) {\n\t\tenc4 = 64;\n\t    }\n \n\t    output = output +\n\t\tthis._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +\n\t\tthis._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);\n \n\t}\n \n\treturn output;\n    },\n \n    // public method for decoding\n    decode : function (input) {\n\tvar output = \"\";\n\tvar chr1, chr2, chr3;\n\tvar enc1, enc2, enc3, enc4;\n\tvar i = 0;\n \n\tinput = input.replace(/[^A-Za-z0-9\\+\\/\\=]/g, \"\");\n \n\twhile (i < input.length) {\n \n\t    enc1 = this._keyStr.indexOf(input.charAt(i++));\n\t    enc2 = this._keyStr.indexOf(input.charAt(i++));\n\t    enc3 = this._keyStr.indexOf(input.charAt(i++));\n\t    enc4 = this._keyStr.indexOf(input.charAt(i++));\n \n\t    chr1 = (enc1 << 2) | (enc2 >> 4);\n\t    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);\n\t    chr3 = ((enc3 & 3) << 6) | enc4;\n \n\t    output = output + String.fromCharCode(chr1);\n \n\t    if (enc3 != 64) {\n\t\toutput = output + String.fromCharCode(chr2);\n\t    }\n\t    if (enc4 != 64) {\n\t\toutput = output + String.fromCharCode(chr3);\n\t    }\n \n\t}\n \n \t// utf8 decode only if utf8 bytes are detected\n \tif(Base64.containsSurrogatePair(output)) {\n\t\toutput = Base64._utf8_decode(output); \t\t\n \t}\n \n\treturn output;\n \n    },\n \n    // private method to check for utf8\n    containsSurrogatePair : function(str) {\n    \treturn /[\\uD800-\\uDFFF]/.test(str);\n\t},\n\n    // private method for UTF-8 encoding\n    _utf8_encode : function (string) {\n\tstring = string.replace(/\\r\\n/g,\"\\n\");\n\tvar utftext = \"\";\n \n\tfor (var n = 0; n < string.length; n++) {\n \n\t    var c = string.charCodeAt(n);\n \n\t    if (c < 128) {\n\t\tutftext += String.fromCharCode(c);\n\t    }\n\t    else if((c > 127) && (c < 2048)) {\n\t\tutftext += String.fromCharCode((c >> 6) | 192);\n\t\tutftext += String.fromCharCode((c & 63) | 128);\n\t    }\n\t    else {\n\t\tutftext += String.fromCharCode((c >> 12) | 224);\n\t\tutftext += String.fromCharCode(((c >> 6) & 63) | 128);\n\t\tutftext += String.fromCharCode((c & 63) | 128);\n\t    }\n \n\t}\n \n\treturn utftext;\n    },\n \n    // private method for UTF-8 decoding\n    _utf8_decode : function (utftext) {\n\tvar string = \"\";\n\tvar i = 0;\n\tvar c = c1 = c2 = 0;\n \n\twhile ( i < utftext.length ) {\n \n\t    c = utftext.charCodeAt(i);\n \n\t    if (c < 128) {\n\t\tstring += String.fromCharCode(c);\n\t\ti++;\n\t    }\n\t    else if((c > 191) && (c < 224)) {\n\t\tc2 = utftext.charCodeAt(i+1);\n\t\tstring += String.fromCharCode(((c & 31) << 6) | (c2 & 63));\n\t\ti += 2;\n\t    }\n\t    else {\n\t\tc2 = utftext.charCodeAt(i+1);\n\t\tc3 = utftext.charCodeAt(i+2);\n\t\tstring += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));\n\t\ti += 3;\n\t    }\n \n\t}\n \n\treturn string;\n    }\n \n}\n\nexports = Base64;\n","friendlyPath":"std.base64","pre":true},"/home/niklas/js.io/packages/std/utf8.js":{"path":"/home/niklas/js.io/packages/std/utf8.js","directory":"/home/niklas/js.io/packages/std/","filename":"utf8.js","src":"/*\nFast incremental JavaScript UTF-8 encoder/decoder, by Jacob Rus.\n\nAPI for decode from Orbited: as far as I know, the first incremental\nJavaScript UTF-8 decoder.\n\nInspired by the observation by Johan Sundström published at:\nhttp://ecmanaut.blogspot.com/2006/07/encoding-decoding-utf8-in-javascript.html\n\nNote that this code throws an error for invalid UTF-8. Because it is so much\nfaster than previous implementations, the recommended way to do lenient\nparsing is to first try this decoder, and then fall back on a slower lenient\ndecoder if necessary for the particular use case.\n\n--------------------\n\nCopyright (c) 2009 Jacob Rus\n\nPermission is hereby granted, free of charge, to any person\nobtaining a copy of this software and associated documentation\nfiles (the \"Software\"), to deal in the Software without\nrestriction, including without limitation the rights to use,\ncopy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the\nSoftware is furnished to do so, subject to the following\nconditions:\n\nThe above copyright notice and this permission notice shall be\nincluded in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND,\nEXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES\nOF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND\nNONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT\nHOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,\nWHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING\nFROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR\nOTHER DEALINGS IN THE SOFTWARE.\n*/\n//var utf8 = this.utf8 = exports;\n\nexports.UnicodeCodecError = function (message) { \n\tthis.message = message; \n};\n\nvar UnicodeCodecError = exports.UnicodeCodecError;\n\nUnicodeCodecError.prototype.toString = function () {\n\treturn 'UnicodeCodecError' + (this.message ? ': ' + this.message : '');\n};\n\nexports.encode = function (unicode_string) {\n\t// Unicode encoder: Given an arbitrary unicode string, returns a string\n\t// of characters with code points in range 0x00 - 0xFF corresponding to\n\t// the bytes of the utf-8 representation of those characters.\n\ttry {\n\t\treturn unescape(encodeURIComponent(unicode_string));\n\t}\n\tcatch (err) {\n\t\tthrow new UnicodeCodecError('invalid input string');\n\t};\n};\nexports.decode = function (bytes) {\n\t// Unicode decoder: Given a string of characters with code points in\n\t// range 0x00 - 0xFF, which, when interpreted as bytes, are valid UTF-8,\n\t// returns the corresponding Unicode string, along with the number of\n\t// bytes in the input string which were successfully parsed.\n\t//\n\t// Unlike most JavaScript utf-8 encode/decode implementations, properly\n\t// deals with partial multi-byte characters at the end of the byte string.\n\tif (/[^\\x00-\\xFF]/.test(bytes)) {\n\t\tthrow new UnicodeCodecError('invalid utf-8 bytes');\n\t};\n\tvar len, len_parsed;\n\tlen = len_parsed = bytes.length;\n\tvar last = len - 1;\n\t// test for non-ascii final byte. if last byte is ascii (00-7F) we're done.\n\tif (bytes.charCodeAt(last) >= 0x80) {\n\t\t// loop through last 3 bytes looking for first initial byte of unicode\n\t\t// multi-byte character. If the initial byte is 4th from the end, we'll\n\t\t// parse the whole string.\n\t\tfor (var i = 1; i <= 3; i++) {\n\t\t\t// initial bytes are in range C0-FF\n\t\t\tif (bytes.charCodeAt(len - i) >= 0xC0) {\n\t\t\t\tlen_parsed = len - i;\n\t\t\t\tbreak;\n\t\t\t};\n\t\t};\n\t\ttry {\n\t\t\t// if the last few bytes are a complete multi-byte character, parse\n\t\t\t// everything (by setting len_parsed)\n\t\t\tdecodeURIComponent(escape(bytes.slice(len_parsed)));\n\t\t\tlen_parsed = len;\n\t\t}\n\t\tcatch (err) { /* pass */ };\n\t};\n\ttry {\n\t\treturn [\n\t\t\tdecodeURIComponent(escape(bytes.slice(0, len_parsed))),\n\t\t\tlen_parsed\n\t\t];\n\t}\n\tcatch (err) {\n\t\tthrow new UnicodeCodecError('invalid utf-8 bytes');\n\t};\n};\n","friendlyPath":"std.utf8","pre":true},"/home/niklas/js.io/packages/std/uri.js":{"path":"/home/niklas/js.io/packages/std/uri.js","directory":"/home/niklas/js.io/packages/std/","filename":"uri.js","src":"var attrs = [ \n\t\"source\",\n\t\"protocol\",\n\t\"authority\",\n\t\"userInfo\",\n\t\"user\",\n\t\"password\",\n\t\"host\",\n\t\"port\",\n\t\"relative\",\n\t\"path\",\n\t\"directory\",\n\t\"file\",\n\t\"query\",\n\t\"anchor\"\n];\n\nvar home_niklas_js_io_packages_std_uri=__class__;var URI = exports=home_niklas_js_io_packages_std_uri(function home_niklas_js_io_packages_std_uri(){return this.init&&this.init.apply(this,arguments)},function(supr) {\n\tthis.init = function(url, isStrict) {\n\t\tif (url instanceof URI) {\n\t\t\tfor (var i = 0, attr; attr = attrs[i]; ++i) {\n\t\t\t\tthis['_' + attr] = url['_' + attr];\n\t\t\t}\n\t\t\treturn;\n\t\t}\n\t\t\n\t\tthis._isStrict = isStrict;\n\t\t\n\t\tvar uriData = exports.parse(url, isStrict);\n\t\tfor (var attr in uriData) {\n\t\t\tthis['_' + attr] = uriData[attr];\n\t\t};\n\t}\n  \n\tfor (var i = 0, attr; attr = attrs[i]; ++i) {\n\t\t(function(attr) {\n\t\t\tvar fNameSuffix = attr.charAt(0).toUpperCase() + attr.slice(1);\n\t\t\tthis['get' + fNameSuffix] = function() {\n\t\t\t\treturn this['_' + attr];\n\t\t\t};\n\t\t\tthis['set' + fNameSuffix] = function(val) {\n\t\t\t\tthis['_' + attr] = val;\n\t\t\t\treturn this;\n\t\t\t};\n\t\t}).call(this, attr);\n\t};\n\t\n\tthis.query = function(key) { return exports.parseQuery(this._query)[key]; }\n\tthis.hash = function(key) { return exports.parseQuery(this._anchor)[key]; }\n\t\n\tthis.addHash = function(kvp) {\n\t\tvar hash = exports.parseQuery(this._anchor);\n\t\tfor (var i in kvp) { hash[i] = kvp[i]; }\n\t\tthis._anchor = exports.buildQuery(hash);\n\t\treturn this;\n\t}\n\t\n\tthis.push = function(path) {\n\t\tif (path) {\n\t\t\tthis._path = (this._path + '/' + path).replace(/\\/\\/+/g, '/');\n\t\t}\n\t\treturn this;\n\t}\n\t\n\tthis.addQuery = function(kvp) {\n\t\tvar query = exports.parseQuery(this._query);\n\t\tfor (var i in kvp) { query[i] = kvp[i]; }\n\t\tthis._query = exports.buildQuery(query);\n\t\treturn this;\n\t}\n\t\n\tthis.removeQuery = function(keys) {\n\t\tvar query = exports.parseQuery(this._query);\n\t\tif (isArray(keys)) {\n\t\t\tfor (var i = 0, n = keys.length; i < n; ++i) {\n\t\t\t\tdelete query[keys[i]];\n\t\t\t}\n\t\t} else {\n\t\t\tdelete query[keys];\n\t\t}\n\t\tthis._query = exports.buildQuery(query);\n\t\treturn this;\n\t}\n\n\tthis.toJSON = function() { return this.toString(false); }\n\n\tthis.toString = function(onlyBase) {\n\t\t// XXX TODO: This is vaguely reasonable, but not complete. fix it...\n\t\tvar a = this._protocol ? this._protocol + \"://\" : \"\"\n\t\tvar b = this._host ? this._host + ((this._port || 80) == 80 ? \"\" : \":\" + this._port) : \"\";\n\t\t\n\t\tif (onlyBase) {\n\t\t\treturn a + b;\n\t\t}\n\t\t\n\t\tvar c = this._path;\n\t\tvar d = this._query ? '?' + this._query : '';\n\t\tvar e = this._anchor ? '#' + this._anchor : '';\n\t\treturn a + b + c + d + e;\n\t};\n});\n\nexports.relativeTo = function(url, base) {\n\tif (!base) { return url; }\n\t\n\turl = String(url);\n\t\n\tif (/^http(s?):\\/\\//.test(url)) { return url; }\n\n\tvar baseURI = new exports(base)\n\t\t.setAnchor('')\n\t\t.setQuery('')\n\t\t.setFile('')\n\t\t.toString(url.charAt(0) == '/');\n\n\treturn new URI(exports.resolveRelative(baseURI + url));\n}\n\nexports.resolveRelative = function(url) {\n\tvar prevUrl;\n\t\n\t// remove ../ with preceeding folder\n\twhile((prevUrl = url) != (url = url.replace(/(^|\\/)([^\\/]+)\\/\\.\\.\\//g, '/'))) {};\n\t\n\t// remove ./ if it isn't preceeded by a .\n\treturn url.replace(/[^.]\\.\\//g, '');\n}\n\nexports.buildQuery = function(kvp) {\n\tvar pairs = [];\n\tfor (var key in kvp) {\n\t\tpairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(kvp[key]));\n\t}\n\treturn pairs.join('&');\n}\n\nexports.parseQuery = function(str) {\n\tvar pairs = str.split('&'),\n\t\tn = pairs.length,\n\t\tdata = {};\n\tfor (var i = 0; i < n; ++i) {\n\t\tvar pair = pairs[i].split('='),\n\t\t\tkey = decodeURIComponent(pair[0]);\n\t\tif (key) { data[key] = decodeURIComponent(pair[1]); }\n\t}\n\treturn data;\n}\n\n// Regexs are based on parseUri 1.2.2\n// Original: (c) Steven Levithan <stevenlevithan.com>\n// Original: MIT License\n\nvar strictRegex = /^(?:([^:\\/?#]+):)?(?:\\/\\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\\/?#]*)(?::(\\d*))?))?((((?:[^?#\\/]*\\/)*)([^?#]*))(?:\\?([^#]*))?(?:#(.*))?)/;\nvar looseRegex = /^(?:(?![^:@]+:[^:@\\/]*@)([^:\\/?#.]+):)?(?:\\/\\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\\/?#]*)(?::(\\d*))?)(((\\/(?:[^?#](?![^?#\\/]*\\.[^?#\\/.]+(?:[?#]|$)))*\\/?)?([^?#\\/]*))(?:\\?([^#]*))?(?:#(.*))?)/;\nvar queryStringRegex = /(?:^|&)([^&=]*)=?([^&]*)/g;\n\nexports.parse = function(str, isStrict) {\n\tvar regex = isStrict ? strictRegex : looseRegex;\n\tvar result = {};\n\tvar match = regex.exec(str);\n\tfor (var i = 0, attr; attr = attrs[i]; ++i) {\n\t\tresult[attr] = match[i] || \"\";\n\t}\n\t\n\tvar qs = result['queryKey'] = {};\n\tresult['query'].replace(queryStringRegex, function(check, key, val) {\n\t\tif (check) {\n\t\t\tqs[key] = val;\n\t\t}\n\t});\n\t\n\treturn result;\n}\n\nexports.isSameDomain = function(urlA, urlB) {\n\tvar a = exports.parse(urlA);\n\tvar b = exports.parse(urlB);\n\treturn ((a.port == b.port ) && (a.host == b.host) && (a.protocol == b.protocol));\n};\n","friendlyPath":"std.uri","pre":true},"/home/niklas/js.io/packages/net/errors.js":{"path":"/home/niklas/js.io/packages/net/errors.js","directory":"/home/niklas/js.io/packages/net/","filename":"errors.js","src":"var makeErrorClass = function(name, _code) {\n\tvar toString = function() {\n\t\treturn name + (this.message ? ': ' + this.message : '');\n\t}\n\n\tvar ctor = function(data) {\n\t\tif (typeof data == 'string') {\n\t\t\tthis.message = data;\n\t\t} else {\n\t\t\tthis.data = data;\n\t\t}\n\t}\n\t\n\tctor.prototype = {\n\t\ttype: name,\n\t\ttoString: toString\n\t};\n\t\n\treturn ctor;\n}\n\nexports.ReadyStateError = makeErrorClass(\"ReadyStateError\");\nexports.InvalidEncodingError = makeErrorClass(\"InvalidEncodingError\");\nexports.ExpiredSession = makeErrorClass(\"ExpiredSession\");\n\nexports.ServerUnreachable = makeErrorClass(\"ServerUnreachable\", 100);\nexports.ConnectionTimeout = makeErrorClass(\"ConnectionTimeout\", 101);\n\nexports.ServerProtocolError = makeErrorClass(\"ServerProtocolError\", 200);\n\nexports.ServerClosedConnection = makeErrorClass(\"ServerClosedConnection\", 301);\nexports.ConnectionClosedCleanly = makeErrorClass(\"ConnectionClosedCleanly\", 300);","friendlyPath":"net.errors","pre":true},"/home/niklas/js.io/packages/net/csp/transports.js":{"path":"/home/niklas/js.io/packages/net/csp/transports.js","directory":"/home/niklas/js.io/packages/net/csp/","filename":"transports.js","src":"jsio('import std.uri as uri'); \njsio('import std.base64 as base64');\njsio('from util.browserdetect import BrowserDetect');\n\n;(function() {\n\tvar doc;\n\texports.getDoc = function() {\n\t\tif (doc) { return doc; }\n\t\ttry {\n\t\t\tdoc = window.ActiveXObject && new ActiveXObject('htmlfile');\n\t\t\tif (doc) {\n\t\t\t\tdoc.open().write('<html></html>');\n\t\t\t\tdoc.close();\n\t\t\t\twindow.attachEvent('onunload', function() {\n\t\t\t\t\ttry { doc.body.innerHTML = ''; } catch(e) {}\n\t\t\t\t\tdoc = null;\n\t\t\t\t});\n\t\t\t}\n\t\t} catch(e) {}\n\t\t\n\t\tif (!doc) { doc = document; }\n\t\treturn doc;\n\t};\n\n\texports.XHR = function() {\n\t\tvar win = window,\n\t\t\tdoc = exports.getDoc();\n\t\t//if (doc.parentWindow) { win = doc.parentWindow; }\n\t\t\n\t\treturn new (exports.XHR = win.XMLHttpRequest ? win.XMLHttpRequest\n\t\t\t: function() { return win.ActiveXObject && new win.ActiveXObject('Msxml2.XMLHTTP') || null; });\n\t}\n\t\n\texports.createXHR = function() { return new exports.XHR(); }\n\n})();\n\nfunction isLocalFile(url) { return /^file:\\/\\//.test(url); }\nfunction isWindowDomain(url) { return uri.isSameDomain(url, window.location.href); }\n\nvar xhrSupportsBinary = undefined;\nfunction checkXHRBinarySupport(xhr) {\n\txhrSupportsBinary = !!xhr.sendAsBinary;\n}\n\nfunction canUseXHR(url) {\n\t// always use jsonp for local files\n\tif (isLocalFile(url)) { return false; }\n\t\n\t// try to create an XHR using the same function the XHR transport uses\n\tvar xhr = new exports.XHR();\n\tif (!xhr) { return false; }\n\t\n\tcheckXHRBinarySupport(xhr);\n\t\n\t// if the URL requested is the same domain as the window,\n\t// then we can use same-domain XHRs\n\tif (isWindowDomain(url)) { return true; }\n\t\n\t// if the URL requested is a different domain than the window,\n\t// then we need to check for cross-domain support\n\tif (window.XMLHttpRequest\n\t\t\t&& (xhr.__proto__ == XMLHttpRequest.prototype // WebKit Bug 25205\n\t\t\t\t|| xhr instanceof window.XMLHttpRequest)\n\t\t\t&& xhr.withCredentials !== undefined\n\t\t|| window.XDomainRequest \n\t\t\t&& xhr instanceof window.XDomainRequest) {\n\t\treturn true;\n\t}\n};\n\nvar transports = exports.transports = {};\n\nexports.chooseTransport = function(url, options) {\n\tswitch(options.preferredTransport) {\n\t\tcase 'jsonp':\n\t\t\treturn transports.jsonp;\n\t\tcase 'xhr':\n\t\tdefault:\n\t\t\tif (canUseXHR(url)) { return transports.xhr; };\n\t\t\treturn transports.jsonp;\n\t}\n};\n\n// TODO: would be nice to use these somewhere...\n\nvar PARAMS = {\n\t'xhrstream':   {\"is\": \"1\", \"bs\": \"\\n\"},\n\t'xhrpoll':     {\"du\": \"0\"},\n\t'xhrlongpoll': {},\n\t'sselongpoll': {\"bp\": \"data: \", \"bs\": \"\\r\\n\", \"se\": \"1\"},\n\t'ssestream':   {\"bp\": \"data: \", \"bs\": \"\\r\\n\", \"se\": \"1\", \"is\": \"1\"}\n};\n\nexports.Transport=__class__;exports.Transport=exports.Transport(function exports_Transport(){return this.init&&this.init.apply(this,arguments)},function(supr) {\n\tthis.handshake = function(url, options) {\n\t\tthrow new Error(\"handshake Not Implemented\"); \n\t};\n\tthis.comet = function(url, sessionKey, lastEventId, options) { \n\t\tthrow new Error(\"comet Not Implemented\"); \n\t};\n\tthis.send = function(url, sessionKey, data, options) { \n\t\tthrow new Error(\"send Not Implemented\");\n\t};\n\tthis.encodePacket = function(packetId, data, options) { \n\t\tthrow new Error(\"encodePacket Not Implemented\"); \n\t};\n\tthis.abort = function() { \n\t\tthrow new Error(\"abort Not Implemented\"); \n\t};\n});\n\nbaseTransport=__class__;var baseTransport=baseTransport(function baseTransport(){return this.init&&this.init.apply(this,arguments)},exports.Transport, function(supr) {\n\tthis.init = function() {\n\t\tthis._aborted = false;\n\t\tthis._handshakeArgs = {ct:'application/javascript'};\n\t\tthis._handshakeData = '{}'\n\t};\n\t\n\tthis.handshake = function(url, options) {\n\t\tlogger.debug('handshake:', url, options);\n\t\tthis._makeRequest('send', url + '/handshake', \n\t\t\t\t\t\t  this._handshakeArgs,\n\t\t\t\t\t\t  this._handshakeData,\n\t\t\t\t\t\t  this.handshakeSuccess, \n\t\t\t\t\t\t  this.handshakeFailure);\n\t};\n\t\n\tthis.comet = function(url, sessionKey, lastEventId, options) {\n\t\tlogger.debug('comet:', url, sessionKey, lastEventId, options);\n\t\tvar args = {\n\t\t\ts: sessionKey,\n\t\t\ta: lastEventId\n\t\t};\n\t\tthis._makeRequest('comet', url + '/comet', \n\t\t\t\t\t\t  args,\n\t\t\t\t\t\t  null,\n\t\t\t\t\t\t  this.cometSuccess, \n\t\t\t\t\t\t  this.cometFailure);\n\t};\n\t\n\tthis.send = function(url, sessionKey, lastEventId, data, options) {\n\t\t//logger.debug('send:', url, sessionKey, data, options);\n\t\tvar args = {\n\t\t\ts: sessionKey,\n\t\t\ta: lastEventId\n\t\t};\n\t\tthis._makeRequest('send', url + '/send', \n\t\t\t\t\t\t  args,\n\t\t\t\t\t\t  data,\n\t\t\t\t\t\t  this.sendSuccess, \n\t\t\t\t\t\t  this.sendFailure);\n\t};\n});\n\ntransports.xhr=__class__;transports.xhr=transports.xhr(function transports_xhr(){return this.init&&this.init.apply(this,arguments)},baseTransport, function(supr) {\n\t\n\tthis.init = function() {\n\t\tsupr(this, 'init');\n\t\n\t\tthis._xhr = {\n\t\t\t'send': new exports.XHR(),\n\t\t\t'comet': new exports.XHR()\n\t\t};\n\t};\n\n\tthis.abort = function() {\n\t\tthis._aborted = true;\n\t\tfor(var i in this._xhr) {\n\t\t\tif(this._xhr.hasOwnProperty(i)) {\n\t\t\t\tthis._abortXHR(i);\n\t\t\t}\n\t\t}\n\t};\n\t\n\tthis._abortXHR = function(type) {\n\t\tlogger.debug('aborting XHR');\n\n\t\tvar xhr = this._xhr[type];\n\t\ttry {\n\t\t\tif('onload' in xhr) {\n\t\t\t\txhr.onload = xhr.onerror = xhr.ontimeout = null;\n\t\t\t} else if('onreadystatechange' in xhr) {\n\t\t\t\txhr.onreadystatechange = null;\n\t\t\t}\n\t\t\tif(xhr.abort) { xhr.abort(); }\n\t\t} catch(e) {\n\t\t\tlogger.debug('error aborting xhr', e);\n\t\t}\n\t\t\n\t\t// do not reuse aborted XHRs\n\t\tthis._xhr[type] = new exports.XHR();\n\t};\n\t\n\tthis.encodePacket = function(packetId, data, options) {\n\t\t// we don't need to base64 encode things unless there's a null character in there\n\t\treturn !xhrSupportsBinary ? [ packetId, 1, base64.encode(data) ] : [ packetId, 0, data ];\n\t};\n\n\tfunction onReadyStateChange(xhr, rType, cb, eb) {\n\t\ttry {\n\t\t\tvar data = {status: xhr.status};\n\t\t} catch(e) { eb({response: 'Could not access status'}); }\n\t\t\n\t\ttry {\n\t\t\tif(xhr.readyState != 4) { return; }\n\t\t\t\n\t\t\tdata.response = eval(xhr.responseText);\n\t\t\tif(data.status != 200) { \n\t\t\t\tlogger.debug('XHR failed with status ', xhr.status);\n\t\t\t\teb(data);\n\t\t\t\treturn;\n\t\t\t}\n\t\t\t\n\t\t\tlogger.debug('XHR data received');\n\t\t} catch(e) {\n\t\t\tlogger.debug('Error in XHR::onReadyStateChange', e);\n\t\t\teb(data);\n\t\t\tthis._abortXHR(rType);\n\t\t\tlogger.debug('done handling XHR error');\n\t\t\treturn;\n\t\t}\n\t\t\n\t\tcb(data);\n\t};\n\n\t/**\n\t * even though we encode the POST body as in application/x-www-form-urlencoded\n\t */\n\tthis._makeRequest = function(rType, url, args, data, cb, eb) {\n\t\tif (this._aborted) { return; }\n\t\tvar xhr = this._xhr[rType];\n\t\txhr.open('POST', url + '?' + uri.buildQuery(args)); // must open XHR first\n\t\txhr.setRequestHeader('Content-Type', 'text/plain'); // avoid preflighting\n\t\tif('onload' in xhr) {\n\t\t\txhr.onload = bind(this, onReadyStateChange, xhr, rType, cb, eb);\n\t\t\txhr.onerror = xhr.ontimeout = eb;\n\t\t} else if('onreadystatechange' in xhr) {\n\t\t\txhr.onreadystatechange = bind(this, onReadyStateChange, xhr, rType, cb, eb);\n\t\t}\n\t\t// NOTE WELL: Firefox (and probably everyone else) likes to encode our nice\n\t\t//\t\t\t\t\t\tbinary strings as utf8. Don't let them! Say no to double utf8\n\t\t//\t\t\t\t\t\tencoding. Once is good, twice isn't better.\n\t\t// if (xhrSupportsBinary) {\n\t\t// \t\txhr.setRequestHeader('x-CSP-SendAsBinary', 'true');\n\t\t// }\n\t\tsetTimeout(function() {\n\t\t\txhr[xhrSupportsBinary ? 'sendAsBinary' : 'send'](data || null)\n\t\t}, 0);\n\t};\n});\n\nvar EMPTY_FUNCTION = function() {},\n\tSLICE = Array.prototype.slice;\n\ntransports.jsonp=__class__;transports.jsonp=transports.jsonp(function transports_jsonp(){return this.init&&this.init.apply(this,arguments)},baseTransport, function(supr) {\n\tvar doc;\n\t\n\tvar createIframe = function() {\n\t\tvar doc = exports.getDoc();\n\t\tif (!doc.body) { return false; }\n\t\t\n\t\tvar i = doc.createElement(\"iframe\");\n\t\twith(i.style) { display = 'block'; width = height = border = margin = padding = '0'; overflow = visibility = 'hidden'; position = 'absolute'; top = left = '-999px'; }\n\t\ti.cbId = 0;\n\t\tdoc.body.appendChild(i);\n\t\ti.src = 'about:blank';\n\t\treturn i;\n\t};\n\n\tvar cleanupIframe = function(ifr) {\n\t\tvar win = ifr.contentWindow, doc = win.document;\n\t\tlogger.debug('removing script tags');\n\t\t\n\t\tvar scripts = doc.getElementsByTagName('script');\n\t\tfor (var i = scripts.length - 1; i >= 0; --i) {\n\t\t\tdoc.body.removeChild(scripts[i]);\n\t\t}\n\t\t\n\t\tlogger.debug('deleting iframe callbacks');\n\t\twin['cb' + ifr.cbId] = win['eb' + ifr.cbId] = EMPTY_FUNCTION;\n\t};\n\n\tvar removeIframe = function(ifr) {\n\t\tsetTimeout(function() {\n\t\t\tif(ifr && ifr.parentNode) { ifr.parentNode.removeChild(ifr); }\n\t\t}, 60000);\n\t};\n\n\tthis.init = function() {\n\t\tsupr(this, 'init');\n\n\t\tthis._onReady = [];\n\t\tthis._isReady = false;\n\n\t\tthis._createIframes();\n\t};\n\n\tthis._createIframes = function() {\n\t\tthis._ifr = {\n\t\t\tsend: createIframe(),\n\t\t\tcomet: createIframe()\n\t\t};\n\t\t\n\t\tif(this._ifr.send === false) { return setTimeout(bind(this, '_createIframes'), 100); }\n\t\t\n\t\tthis._isReady = true;\n\n\t\tvar readyArgs = this._onReady;\n\t\tthis._onReady = [];\n\t\tfor(var i = 0, args; args = readyArgs[i]; ++i) {\n\t\t\tthis._makeRequest.apply(this, args);\n\t\t}\n\t};\n\n\tthis.encodePacket = function(packetId, data, options) {\n\t\treturn [ packetId, 1, base64.encode(data) ];\n\t};\n\n\tthis.abort = function() {\n\t\tthis._aborted = true;\n\t\tfor(var i in this._ifr) {\n\t\t\tif(this._ifr.hasOwnProperty(i)) {\n\t\t\t\tvar ifr = this._ifr[i];\n\t\t\t\tcleanupIframe(ifr);\n\t\t\t\tremoveIframe(ifr);\n\t\t\t}\n\t\t}\n\t};\n\t\n\tthis._makeRequest = function(rType, url, args, data, cb, eb) {\n\t\tif(!this._isReady) { return this._onReady.push(arguments); }\n\t\t\n\t\tvar ifr = this._ifr[rType],\n\t\t\tid = ++ifr.cbId,\n\t\t\treq = {\n\t\t\t\ttype: rType,\n\t\t\t\tid: id,\n\t\t\t\tcb: cb,\n\t\t\t\teb: eb,\n\t\t\t\tcbName: 'cb' + id,\n\t\t\t\tebName: 'eb' + id,\n\t\t\t\tcompleted: false\n\t\t\t};\n\t\t\n\t\targs.d = data;\n\t\targs.n = Math.random();\t\n\t\tswitch(rType) {\n\t\t\tcase 'send': args.rs = ';'; args.rp = req.cbName; break;\n\t\t\tcase 'comet': args.bs = ';'; args.bp = req.cbName; break;\n\t\t}\n\t\t\n\t\treq.url = url + '?' + uri.buildQuery(args)\n\t\t\n\t\tsetTimeout(bind(this, '_request', req), 0);\n\t}\n\t\n\tthis._request = function(req) {\n\t\tvar ifr = this._ifr[req.type],\n\t\t\twin = ifr.contentWindow,\n\t\t\tdoc = win.document,\n\t\t\tbody = doc.body;\n                /*added by skysbird for opera support*/\n                if (!body){return setTimeout(bind(this,'_request',req),100); }\n\t\twin[req.ebName] = bind(this, checkForError, req);\n\t\twin[req.cbName] = bind(this, onSuccess, req);\n\t\t\n\t\tif(BrowserDetect.isWebKit) {\n\t\t\t// this will probably cause loading bars in Safari -- might want to rethink?\n\t\t\tdoc.open();\n\t\t\tdoc.write('<scr'+'ipt src=\"'+req.url+'\"></scr'+'ipt><scr'+'ipt>'+ebName+'(false)</scr'+'ipt>');\n\t\t\tdoc.close();\n\t\t} else {\n\t\t\tvar s = doc.createElement('script');\n\t\t\ts.src = req.url;\n\t\t\t\n\t\t\t// IE\n\t\t\tif(s.onreadystatechange === null) { s.onreadystatechange = bind(this, onReadyStateChange, req, s); }\n\t\t\tbody.appendChild(s);\n\t\t\t\n\t\t\tif(!BrowserDetect.isIE) {\n\t\t\t\tvar s = doc.createElement('script');\n\t\t\t\ts.innerHTML = req.ebName+'(false)';\n\t\t\t\tbody.appendChild(s);\n\t\t\t}\n\t\t}\n\t\t\n\t\tkillLoadingBar();\n\t};\n\t\n\tfunction onSuccess(req, response) {\n\t\tlogger.debug('successful: ', req.url, response);\n\t\treq.completed = true;\n\t\t\n\t\tlogger.debug('calling the cb');\n\t\treq.cb.call(GLOBAL, {status: 200, response: response});\n\t\tlogger.debug('cb called');\n\t}\n\t\n\t// IE6/7 onReadyStateChange\n\tfunction onReadyStateChange(req, scriptTag) {\n\t\tif (scriptTag && scriptTag.readyState != 'loaded') { return; }\n\t\tscriptTag.onreadystatechange = function() {};\n\t\tcheckForError.call(this, req);\n\t}\n\n\tfunction checkForError(req, response) {\n\t\tcleanupIframe(this._ifr[req.type]);\n\t\t\n\t\tif (!req.completed) {\n\t\t\tvar data = {\n\t\t\t\tstatus: response ? 200 : 404,\n\t\t\t\tresponse: response || 'Unable to load resouce'\n\t\t\t};\n\t\t\t\n\t\t\tlogger.debug('error making request:', req.url, data);\n\t\t\tlogger.debug('calling eb');\n\t\t\treq.eb.call(GLOBAL, data);\n\t\t}\n\t}\n\t\n\tvar killLoadingBar = BrowserDetect.isFirefox || BrowserDetect.isOpera ? function() {\n\t\tvar b = document.body;\n\t\tif (!b) { return; }\n\t\t\n\t\tif (!killLoadingBar.iframe) { killLoadingBar.iframe = document.createElement('iframe'); }\n\t\tb.insertBefore(killLoadingBar.iframe, b.firstChild);\n\t\tb.removeChild(killLoadingBar.iframe);\n\t} : function() {};\n});\n","friendlyPath":".transports","pre":true},"/home/niklas/js.io/packages/util/browserdetect.js":{"path":"/home/niklas/js.io/packages/util/browserdetect.js","directory":"/home/niklas/js.io/packages/util/","filename":"browserdetect.js","src":"exports.BrowserDetect = new function() {\n\tvar versionSearchString;\n\tvar dataBrowser = [\n\t\t{\n\t\t\tstring: navigator.userAgent,\n\t\t\tsubString: \"Chrome\"\n\t\t},\n\t\t{\n\t\t\tstring: navigator.userAgent,\n\t\t\tsubString: \"OmniWeb\",\n\t\t\tversionSearch: \"OmniWeb/\"\n\t\t},\n\t\t{\n\t\t\tstring: navigator.vendor,\n\t\t\tsubString: \"Apple\",\n\t\t\tidentity: \"Safari\",\n\t\t\tversionSearch: \"Version\"\n\t\t},\n\t\t{\n\t\t\tprop: window.opera,\n\t\t\tidentity: \"Opera\"\n\t\t},\n\t\t{\n\t\t\tstring: navigator.vendor,\n\t\t\tsubString: \"iCab\"\n\t\t},\n\t\t{\n\t\t\tstring: navigator.vendor,\n\t\t\tsubString: \"KDE\",\n\t\t\tidentity: \"Konqueror\"\n\t\t},\n\t\t{\n\t\t\tstring: navigator.userAgent,\n\t\t\tsubString: \"Firefox\"\n\t\t},\n\t\t{\n\t\t\tstring: navigator.vendor,\n\t\t\tsubString: \"Camino\"\n\t\t},\n\t\t{\t\t// for newer Netscapes (6+)\n\t\t\tstring: navigator.userAgent,\n\t\t\tsubString: \"Netscape\"\n\t\t},\n\t\t{\n\t\t\tstring: navigator.userAgent,\n\t\t\tsubString: \"MSIE\",\n\t\t\tidentity: \"IE\",\n\t\t\tversionSearch: \"MSIE\"\n\t\t},\n\t\t{\n\t\t\tstring: navigator.userAgent,\n\t\t\tsubString: \"Gecko\",\n\t\t\tidentity: \"Mozilla\",\n\t\t\tversionSearch: \"rv\"\n\t\t},\n\t\t{ \t\t// for older Netscapes (4-)\n\t\t\tstring: navigator.userAgent,\n\t\t\tsubString: \"Mozilla\",\n\t\t\tidentity: \"Netscape\",\n\t\t\tversionSearch: \"Mozilla\"\n\t\t}\n\t];\n\t\n\tvar dataOS = [\n\t\t{\n\t\t\tstring: navigator.platform,\n\t\t\tsubString: \"Win\",\n\t\t\tidentity: \"Windows\"\n\t\t},\n\t\t{\n\t\t\tstring: navigator.platform,\n\t\t\tsubString: \"Mac\"\n\t\t},\n\t\t{\n\t\t\tstring: navigator.userAgent,\n\t\t\tsubString: \"iPhone\",\n\t\t\tidentity: \"iPhone/iPod\"\n\t\t},\n\t\t{\n\t\t\tstring: navigator.platform,\n\t\t\tsubString: \"Linux\"\n\t\t}\n\t];\n\t\n\tfunction searchString(data) {\n\t\tfor (var i=0,item;item=data[i];i++)\t{\n\t\t\tvar dataString = item.string;\n\t\t\tvar dataProp = item.prop;\n\t\t\titem.identity = item.identity || item.subString;\n\t\t\tversionSearchString = item.versionSearch || item.identity;\n\t\t\tif (dataString) {\n\t\t\t\tif (dataString.indexOf(item.subString) != -1)\n\t\t\t\t\treturn item.identity;\n\t\t\t} else if (dataProp)\n\t\t\t\treturn item.identity;\n\t\t}\n\t}\n\t\n\tfunction searchVersion(dataString) {\n\t\tvar index = dataString.indexOf(versionSearchString);\n\t\tif (index == -1) return;\n\t\treturn parseFloat(dataString.substring(index+versionSearchString.length+1));\n\t}\n\t\n\tthis.browser = searchString(dataBrowser) || \"unknown\";\n\tthis.version = searchVersion(navigator.userAgent)\n\t\t|| searchVersion(navigator.appVersion)\n\t\t|| \"unknown\";\n\tthis.OS = searchString(dataOS) || \"unknown\";\n\tthis.isWebKit = RegExp(\" AppleWebKit/\").test(navigator.userAgent);\n\tthis['is'+this.browser] = this.version;\n};","friendlyPath":"util.browserdetect","pre":true},"/home/niklas/js.io/packages/lib/Enum.js":{"path":"/home/niklas/js.io/packages/lib/Enum.js","directory":"/home/niklas/js.io/packages/lib/","filename":"Enum.js","baseMod":"lib","basePath":"/home/niklas/js.io/packages/","src":"exports = function() {\n\tif (arguments.length == 1) {\n\t\tif (typeof arguments[0] == 'object') {\n\t\t\tvar obj = arguments[0];\n\t\t\tfor (var i in obj) {\n\t\t\t\tif (!(obj[i] in obj)) {\n\t\t\t\t\tobj[obj[i]] = i;\n\t\t\t\t}\n\t\t\t}\n\t\t\treturn obj;\n\t\t} else if (typeof arguments[0] != 'string') {\n\t\t\tkeys = arguments[0];\n\t\t}\n\t}\n\t\n\tif (!keys) { var keys = arguments; }\n\tvar obj = {};\n\tfor(var i = 0, len = keys.length; i < len; ++i) {\n\t\tif (keys[i]) {\n\t\t\tobj[keys[i]] = i + 1;\n\t\t}\n\t\tobj[i + 1] = keys[i];\n\t}\n\treturn obj;\n}","friendlyPath":"lib.Enum","pre":true},"/home/niklas/js.io/packages/net/env/browser/websocket.js":{"path":"/home/niklas/js.io/packages/net/env/browser/websocket.js","directory":"/home/niklas/js.io/packages/net/env/browser/","filename":"websocket.js","src":"jsio('import net.interfaces');\njsio('import std.utf8 as utf8');\njsio('import net.errors as Errors');\n\n/**\n * @extends net.interfaces.Connector\n */\nexports.Connector=__class__;exports.Connector=exports.Connector(function exports_Connector(){return this.init&&this.init.apply(this,arguments)},net.interfaces.Connector, function() {\n\tthis.connect = function() {\n\t\tthis._state = net.interfaces.STATE.CONNECTING;\n\t\t\n\t\tvar url = this._opts.url,\n\t\t \tctor = this._opts.wsConstructor || window.WebSocket;\n\t\n\t\tlogger.info('this._opts', this._opts);\n\t\t\n\t\tvar ws = new ctor(url);\n\t\tws.onopen = bind(this, 'webSocketOnOpen', ws);\n\t\tws.onclose = bind(this, 'webSocketOnClose', ws);\n\t}\n\t\n\tthis.webSocketOnOpen = function(ws) {\n\t\tthis.onConnect(new Transport(ws));\n\t}\n\t\n\tthis.webSocketOnClose = function(ws, e) {\n\t\tvar err,\n\t\t\tdata = {rawError: e, webSocket: ws};\n\t\tif (e.wasClean) {\n\t\t\terr = new Errors.ServerClosedConnection('WebSocket Connection Closed', data);\n\t\t} else {\n\t\t\tif (this._state == net.interfaces.STATE.CONNECTED) {\n\t\t\t\terr = new Errors.ConnectionTimeout('WebSocket Connection Timed Out', data);\n\t\t\t} else {\n\t\t\t\terr = new Errors.ServerUnreachable('WebSocket Connection Failed', data);\n\t\t\t}\n\t\t}\n\t\t\n\t\tlogger.debug('conn closed', err);\n\t\tthis.onDisconnect(err);\n\t}\n});\n\nTransport=__class__;var Transport=Transport(function Transport(){return this.init&&this.init.apply(this,arguments)},net.interfaces.Transport, function() {\n\t\n\tthis.init = function(ws) {\n\t\tthis._ws = ws;\n\t}\n\t\n\tthis.makeConnection = function(protocol) {\n\t\tthis._ws.onmessage = function(data) {\n\t\t\tvar payload = utf8.encode(data.data);\n\t\t\tprotocol.dataReceived(payload);\n\t\t}\n\t}\n\t\n\tthis.write = function(data, encoding) {\n\t\tif (this._encoding == 'plain') {\n\t\t\tresult = utf8.decode(data);\n\t\t\tdata = result[0];\n\t\t}\n\t\tthis._ws.send(data);\n\t}\n\t\n\tthis.loseConnection = function(protocol) {\n\t\tthis._ws.close();\n\t}\n});\n","friendlyPath":"net.env.browser.websocket","pre":true},"/home/niklas/js.io/packages/std/JSON.js":{"path":"/home/niklas/js.io/packages/std/JSON.js","directory":"/home/niklas/js.io/packages/std/","filename":"JSON.js","src":"// Based on json2.js (version 2009-09-29) http://www.JSON.org/json2.js\n// exports createGlobal, stringify, parse, stringifyDate\n\n/**\n * if a global JSON object doesn't exist, create one\n */\nexports.createGlobal = function() {\n\tif(typeof JSON == 'undefined') { JSON = {}; }\n\tif(typeof JSON.stringify !== 'function') {\n\t\tJSON.stringify = exports.stringify;\n\t}\n\tif(typeof JSON.parse !== 'function') {\n\t\tJSON.parse = exports.parse;\n\t}\n};\n\n;(function() {\n\tvar cx = /[\\u0000\\u00ad\\u0600-\\u0604\\u070f\\u17b4\\u17b5\\u200c-\\u200f\\u2028-\\u202f\\u2060-\\u206f\\ufeff\\ufff0-\\uffff]/g,\n\t\tescapable = /[\\\\\\\"\\x00-\\x1f\\x7f-\\x9f\\u00ad\\u0600-\\u0604\\u070f\\u17b4\\u17b5\\u200c-\\u200f\\u2028-\\u202f\\u2060-\\u206f\\ufeff\\ufff0-\\uffff]/g,\n\t\tgap,\n\t\tindent,\n\t\tmeta = {\t// table of character substitutions\n\t\t\t'\\b': '\\\\b',\n\t\t\t'\\t': '\\\\t',\n\t\t\t'\\n': '\\\\n',\n\t\t\t'\\f': '\\\\f',\n\t\t\t'\\r': '\\\\r',\n\t\t\t'\"' : '\\\\\"',\n\t\t\t'\\\\': '\\\\\\\\'\n\t\t},\n\t\trep;\n\t\n\tfunction quote(string) {\n\t\t// quote the string if it doesn't contain control characters, quote characters, and backslash characters\n\t\t// otherwise, replace those characters with safe escape sequences\n\t\tescapable.lastIndex = 0;\n\t\treturn escapable.test(string)\n\t\t\t? '\"' + string.replace(escapable, function (a) {\n\t\t\t\t\tvar c = meta[a];\n\t\t\t\t\treturn typeof c === 'string' ? c : '\\\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);\n\t\t\t\t}) + '\"'\n\t\t\t: '\"' + string + '\"';\n\t}\n\t\n\t// Produce a string from holder[key].\n\tfunction str(key, holder) {\n\t\tvar mind = gap, value = holder[key];\n\t\t\n\t\t// If the value has a toJSON method, call it to obtain a replacement value.\n\t\tif (value && typeof value === 'object' && typeof value.toJSON === 'function') {\n\t\t\tvalue = value.toJSON(key);\n\t\t}\n\t\t\n\t\t// If we were called with a replacer function, then call the replacer to\n\t\t// obtain a replacement value.\n\t\tif (typeof rep === 'function') { value = rep.call(holder, key, value); }\n\t\t\n\t\tswitch (typeof value) {\n\t\t\tcase 'string':\n\t\t\t\treturn quote(value);\n\t\t\tcase 'number':\n\t\t\t\t// JSON numbers must be finite\n\t\t\t\treturn isFinite(value) ? String(value) : 'null';\n\t\t\tcase 'boolean':\n\t\t\t\treturn String(value);\n\t\t\tcase 'object': // object, array, date, null\n\t\t\t\tif (value === null) { return 'null'; } // typeof null == 'object'\n\t\t\t\tif (value.constructor === Date) { return exports.stringifyDate(value); }\n\t\t\t\n\t\t\t\tgap += indent;\n\t\t\t\tvar partial = [];\n\t\t\t\t\n\t\t\t\t// Is the value an array?\n\t\t\t\tif (value.constructor === Array) {\n\t\t\t\t\tvar length = value.length;\n\t\t\t\t\tfor (var i = 0; i < length; i += 1) {\n\t\t\t\t\t\tpartial[i] = str(i, value) || 'null';\n\t\t\t\t\t}\n\t\t\t\t\t\n\t\t\t\t\t// Join all of the elements together, separated with commas, and wrap them in brackets.\n\t\t\t\t\tvar v = partial.length === 0 ? '[]' :\n\t\t\t\t\t\tgap ? '[\\n' + gap +\n\t\t\t\t\t\t\t\tpartial.join(',\\n' + gap) + '\\n' +\n\t\t\t\t\t\t\t\t\tmind + ']' :\n\t\t\t\t\t\t\t  '[' + partial.join(',') + ']';\n\t\t\t\t\tgap = mind;\n\t\t\t\t\treturn v;\n\t\t\t\t}\n\t\t\t\t\n\t\t\t\tif (rep && typeof rep === 'object') { // rep is an array\n\t\t\t\t\tvar length = rep.length;\n\t\t\t\t\tfor (var i = 0; i < length; i += 1) {\n\t\t\t\t\t\tvar k = rep[i];\n\t\t\t\t\t\tif (typeof k === 'string') {\n\t\t\t\t\t\t\tvar v = str(k, value);\n\t\t\t\t\t\t\tif (v) {\n\t\t\t\t\t\t\t\tpartial.push(quote(k) + (gap ? ': ' : ':') + v);\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t} else { // iterate through all of the keys in the object.\n\t\t\t\t\tfor (var k in value) {\n\t\t\t\t\t\tif (Object.hasOwnProperty.call(value, k)) {\n\t\t\t\t\t\t\tvar v = str(k, value);\n\t\t\t\t\t\t\tif (v) {\n\t\t\t\t\t\t\t\tpartial.push(quote(k) + (gap ? ': ' : ':') + v);\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t}\n\n\t\t\t\t// Join all of the member texts together, separated with commas,\n\t\t\t\t// and wrap them in braces.\n\t\t\t\tvar v = partial.length === 0 ? '{}' :\n\t\t\t\t\tgap ? '{\\n' + gap + partial.join(',\\n' + gap) + '\\n' +\n\t\t\t\t\t\t\tmind + '}' : '{' + partial.join(',') + '}';\n\t\t\t\tgap = mind;\n\t\t\t\treturn v;\n\t\t}\n\t}\n\n\n\t/**\n\t * The stringify method takes a value and an optional replacer, and an optional\n\t * space parameter, and returns a JSON text. The replacer can be a function\n\t * that can replace values, or an array of strings that will select the keys.\n \t * A default replacer method can be provided. Use of the space parameter can\n\t * produce text that is more easily readable.\n\t */\n\texports.stringify = function (value, replacer, space) {\n\t\tgap = '';\n\t\tindent = '';\n\t\t\n\t\t// If the space parameter is a number, make an indent string containing that many spaces.\n\t\tif (typeof space === 'number') {\n\t\t\tfor (var i = 0; i < space; i += 1) {\n\t\t\t\tindent += ' ';\n\t\t\t}\n\t\t} else if (typeof space === 'string') {\n\t\t\tindent = space;\n\t\t}\n\t\t\n\t\t// If there is a replacer, it must be a function or an array.\n\t\trep = replacer;\n\t\tif (replacer && typeof replacer !== 'function' &&\n\t\t\t\t(typeof replacer !== 'object' ||\n\t\t\t\t typeof replacer.length !== 'number')) {\n\t\t\tthrow new Error('JSON stringify: invalid replacer');\n\t\t}\n\t\t\n\t\t// Make a fake root object containing our value under the key of ''.\n\t\t// Return the result of stringifying the value.\n\t\treturn str('', {'': value});\n\t};\n\t\n\texports.stringifyDate = function(d) {\n\t\tvar year = d.getUTCFullYear(),\n\t\t\tmonth = d.getUTCMonth() + 1,\n\t\t\tday = d.getUTCDate(),\n\t\t\thours = d.getUTCHours(),\n\t\t\tminutes = d.getUTCMinutes(),\n\t\t\tseconds = d.getUTCSeconds(),\n\t\t\tms = d.getUTCMilliseconds();\n\t\t\n\t\tif (month < 10) { month = '0' + month; }\n\t\tif (day < 10) { day = '0' + day; }\n\t\tif (hours < 10) { hours = '0' + hours; }\n\t\tif (minutes < 10) { minutes = '0' + minutes; }\n\t\tif (seconds < 10) { seconds = '0' + seconds; }\n\t\tif (ms < 10) { ms = '00' + ms; }\n\t\telse if (ms < 100) { ms = '0' + ms; }\n\n\t\treturn '\"' + year\n\t\t\t+ '-' + month\n\t\t\t+ '-' + day\n\t\t\t+ 'T' + hours\n\t\t\t+ ':' + minutes\n\t\t\t+ ':' + seconds\n\t\t\t+ '.' + ms\n\t\t\t+ 'Z\"';\n\t}\n\t\n\t/**\n\t * The parse method takes a text and an optional reviver function, and returns\n\t * a JavaScript value if the text is a valid JSON text.\n\t */\n\texports.parse = function (text, reviver) {\n\t\t// Parsing happens in four stages. In the first stage, we replace certain\n\t\t// Unicode characters with escape sequences. JavaScript handles many characters\n\t\t// incorrectly, either silently deleting them, or treating them as line endings.\n\t\tcx.lastIndex = 0;\n\t\tif (cx.test(text)) {\n\t\t\ttext = text.replace(cx, function (a) {\n\t\t\t\treturn '\\\\u' +\n\t\t\t\t\t('0000' + a.charCodeAt(0).toString(16)).slice(-4);\n\t\t\t});\n\t\t}\n\t\t\n\t\t// In the second stage, we run the text against regular expressions that look\n\t\t// for non-JSON patterns. We are especially concerned with '()' and 'new'\n\t\t// because they can cause invocation, and '=' because it can cause mutation.\n\t\t// But just to be safe, we want to reject all unexpected forms.\n\n\t\t// We split the second stage into 4 regexp operations in order to work around\n\t\t// crippling inefficiencies in IE's and Safari's regexp engines. First we\n\t\t// replace the JSON backslash pairs with '@' (a non-JSON character). Second, we\n\t\t// replace all simple value tokens with ']' characters. Third, we delete all\n\t\t// open brackets that follow a colon or comma or that begin the text. Finally,\n\t\t// we look to see that the remaining characters are only whitespace or ']' or\n\t\t// ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.\n\n\t\tif (/^[\\],:{}\\s]*$/\n\t\t\t\t.test(text.replace(/\\\\(?:[\"\\\\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')\n\t\t\t\t.replace(/\"[^\"\\\\\\n\\r]*\"|true|false|null|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?/g, ']')\n\t\t\t\t.replace(/(?:^|:|,)(?:\\s*\\[)+/g, '')))\n\t\t{\n\t\t\tvar j = eval('(' + text + ')');\n\t\t\tif(!reviver) {\n\t\t\t\treturn j;\n\t\t\t} else {\n\t\t\t\t// In the optional fourth stage, we recursively walk the new structure, passing\n\t\t\t\t// each name/value pair to a reviver function for possible transformation.\n\t\t\t\tvar walk = function(holder, key) {\n\t\t\t\t\t// The walk method is used to recursively walk the resulting structure so\n\t\t\t\t\t// that modifications can be made.\n\t\t\t\t\tvar k, v, value = holder[key];\n\t\t\t\t\tif (value && typeof value === 'object') {\n\t\t\t\t\t\tfor (k in value) {\n\t\t\t\t\t\t\tif (Object.hasOwnProperty.call(value, k)) {\n\t\t\t\t\t\t\t\tv = walk(value, k);\n\t\t\t\t\t\t\t\tif (v !== undefined) {\n\t\t\t\t\t\t\t\t\tvalue[k] = v;\n\t\t\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\t\t\tdelete value[k];\n\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t\treturn reviver.call(holder, key, value);\n\t\t\t\t}\n\t\t\t\treturn walk({'': j}, '');\n\t\t\t}\n\t\t}\n\n\t\t// If the text is not JSON parseable, then a SyntaxError is thrown.\n\t\tthrow new SyntaxError('JSON.parse');\n\t};\n}());","friendlyPath":"std.JSON","pre":true},"/home/niklas/js.io/packages/net/buffer.js":{"path":"/home/niklas/js.io/packages/net/buffer.js","directory":"/home/niklas/js.io/packages/net/","filename":"buffer.js","src":"jsio('from net.interfaces import Protocol');\n\nexports.EmptyBufferError=__class__;var EmptyBufferError = exports.EmptyBufferError=exports.EmptyBufferError(function exports_EmptyBufferError(){return this.init&&this.init.apply(this,arguments)},function () {\n\tthis.init = function(message) { this.message = message; }\n})\n\nexports.Buffer=__class__;exports.Buffer=exports.Buffer(function exports_Buffer(){return this.init&&this.init.apply(this,arguments)},function(supr) {\n\n\tthis.init = function(rawBuffer) {\n\t\t\n\t\tthis._rawBuffer = !!rawBuffer ? rawBuffer : \"\";\n\t}\n\n\tthis.getLength = function() {\n\t\treturn this._rawBuffer.length;\n\t}\n\n\tthis.append = function(data) {\n\t\tlogger.debug('append', JSON.stringify(data));\n\t\tthis._rawBuffer += data;\n\t}\n\n\tthis.peekBytes = function(num) {\n\t\tif (!!num)\n\t\t\treturn this._rawBuffer.slice(0, num);\n\t\telse \n\t\t\treturn this._rawBuffer;\n\t}\n\n\tthis.peekToDelimiter = function(delimiter) {\n\t\tdelimiter = delimiter ? delimiter : '\\n';\n\t\tvar i = this._rawBuffer.indexOf(delimiter);\n\t\tif (i == -1)\n\t\t\tthrow new EmptyBufferError(\"delimiter \" + delimiter + \"not present in buffer\");\n\t\telse\n\t\t\treturn this._rawBuffer.slice(0, i);\n\t}\n\n\tthis.consumeBytes = function(num) {\n\t\tvar output = this.peekBytes(num);\n\t\tthis._rawBuffer = this._rawBuffer.slice(output.length);\n\t\treturn output;\n\t}\n\tthis.consumeMaxBytes = function(num) {\n\t\tvar output = this._rawBuffer.slice(0, num);\n\t\tthis._rawBuffer = this._rawBuffer(num);\n\t\treturn output;\n\t}\n\tthis.consumeAllBytes = function() {\n\t\tvar temp = this._rawBuffer;\n\t\tthis._rawBuffer = \"\";\n\t\treturn temp;\n\t}\n\t\n\tthis.consumeThroughDelimiter = function(delimiter) {\n\t\treturn this.consumeToDelimiter(delimiter) + this.consumeBytes(delimiter.length);\n\t}\n\n\tthis.consumeToDelimiter = function(delimiter) {\n\t\tdelimiter = !!delimiter ? delimiter : \"\\n\"\n\t\tvar output = this.peekToDelimiter(delimiter);\n\t\tthis._rawBuffer = this._rawBuffer.slice(output.length);\n\t\treturn output;\n\t}\n\n\tthis.hasBytes = function(num) {\n\t\tnum = num ? num : 0;\n\t\treturn this._rawBuffer.length >= num;\n\t}\n\n\tthis.hasDelimiter = function(delimiter) {\n\t\tdelimiter = !!delimiter ? delimiter : '\\n';\n\t\treturn (this._rawBuffer.indexOf(delimiter) != -1);\n\t}\n\n})\n","friendlyPath":"net.buffer","pre":true},"/home/niklas/js.io/packages/std/utf16.js":{"path":"/home/niklas/js.io/packages/std/utf16.js","directory":"/home/niklas/js.io/packages/std/","filename":"utf16.js","src":"/* utf.js - UTF-8 <=> UTF-16 convertion\n *\n * Copyright (C) 1999 Masanao Izumo <iz@onicos.co.jp>\n * Version: 1.0\n * LastModified: Dec 25 1999\n * This library is free.  You can redistribute it and/or modify it.\n */\n\n/*\n * Interfaces:\n * utf8 = utf16to8(utf16);\n * utf16 = utf16to8(utf8);\n */\n\nexports.utf16to8 = function (str) { \n    var out, i, len, c;\n\n    out = \"\";\n    len = str.length;\n    for(i = 0; i < len; i++) {\n\t\tc = str.charCodeAt(i);\n\t\tif ((c >= 0x0001) && (c <= 0x007F)) {\n\t\t\t    out += str.charAt(i);\n\t\t\t} else if (c > 0x07FF) {\n\t\t\t    out += String.fromCharCode(0xE0 | ((c >> 12) & 0x0F));\n\t\t\t    out += String.fromCharCode(0x80 | ((c >>  6) & 0x3F));\n\t\t\t    out += String.fromCharCode(0x80 | ((c >>  0) & 0x3F));\n\t\t\t} else {\n\t\t\t    out += String.fromCharCode(0xC0 | ((c >>  6) & 0x1F));\n\t\t\t    out += String.fromCharCode(0x80 | ((c >>  0) & 0x3F));\n\t\t}\n    }\n    return out;\n}\n\n\nexports.utf8to16 = function (str) {\n    var out, i, len, c;\n    var char2, char3;\n\n    out = \"\";\n    len = str.length;\n    i = 0;\n    while(i < len) {\n\tc = str.charCodeAt(i++);\n\tswitch(c >> 4)\n\t{ \n\t  case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:\n\t    // 0xxxxxxx\n\t    out += str.charAt(i-1);\n\t    break;\n\t  case 12: case 13:\n\t    // 110x xxxx   10xx xxxx\n\t    char2 = str.charCodeAt(i++);\n\t    out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));\n\t    break;\n\t  case 14:\n\t    // 1110 xxxx  10xx xxxx  10xx xxxx\n\t    char2 = str.charCodeAt(i++);\n\t    char3 = str.charCodeAt(i++);\n\t    out += String.fromCharCode(((c & 0x0F) << 12) |\n\t\t\t\t\t   ((char2 & 0x3F) << 6) |\n\t\t\t\t\t   ((char3 & 0x3F) << 0));\n\t    break;\n\t}\n    }\n\n    return out;\n}","friendlyPath":"std.utf16","pre":true}});jsio("./Orbited2")