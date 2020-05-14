define(["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const hasLocalStorage = typeof localStorage !== `undefined`;
    const hasProcess = typeof process !== `undefined`;
    const shouldDebug = (hasLocalStorage && localStorage.getItem('DEBUG')) || (hasProcess && process.env.DEBUG);
    const debugLog = shouldDebug ? console.log : (_message, ..._optionalParams) => '';
    /**
     * Makes a virtual copy of the TypeScript environment. This is the main API you want to be using with
     * typescript-vfs. A lot of the other exposed functions are used by this function to get set up.
     *
     * @param sys an object which conforms to the TS Sys (a shim over read/write access to the fs)
     * @param rootFiles a list of files which are considered inside the project
     * @param ts a copy pf the TypeScript module
     * @param compilerOptions the options for this compiler run
     */
    function createVirtualTypeScriptEnvironment(sys, rootFiles, ts, compilerOptions = {}) {
        const mergedCompilerOpts = Object.assign(Object.assign({}, defaultCompilerOptions(ts)), compilerOptions);
        const { languageServiceHost, updateFile } = createVirtualLanguageServiceHost(sys, rootFiles, mergedCompilerOpts, ts);
        const languageService = ts.createLanguageService(languageServiceHost);
        const diagnostics = languageService.getCompilerOptionsDiagnostics();
        if (diagnostics.length) {
            const compilerHost = createVirtualCompilerHost(sys, compilerOptions, ts);
            throw new Error(ts.formatDiagnostics(diagnostics, compilerHost.compilerHost));
        }
        return {
            sys,
            languageService,
            getSourceFile: fileName => { var _a; return (_a = languageService.getProgram()) === null || _a === void 0 ? void 0 : _a.getSourceFile(fileName); },
            createFile: (fileName, content) => {
                updateFile(ts.createSourceFile(fileName, content, mergedCompilerOpts.target, false));
            },
            updateFile: (fileName, content, optPrevTextSpan) => {
                const prevSourceFile = languageService.getProgram().getSourceFile(fileName);
                const prevFullContents = prevSourceFile.text;
                // TODO: Validate if the default text span has a fencepost error?
                const prevTextSpan = (optPrevTextSpan !== null && optPrevTextSpan !== void 0 ? optPrevTextSpan : ts.createTextSpan(0, prevFullContents.length));
                const newText = prevFullContents.slice(0, prevTextSpan.start) +
                    content +
                    prevFullContents.slice(prevTextSpan.start + prevTextSpan.length);
                const newSourceFile = ts.updateSourceFile(prevSourceFile, newText, {
                    span: prevTextSpan,
                    newLength: content.length,
                });
                updateFile(newSourceFile);
            },
        };
    }
    exports.createVirtualTypeScriptEnvironment = createVirtualTypeScriptEnvironment;
    /**
     * Grab the list of lib files for a particular target, will return a bit more than necessary (by including
     * the dom) but that's OK
     *
     * @param target The compiler settings target baseline
     * @param ts A copy of the TypeScript module
     */
    exports.knownLibFilesForCompilerOptions = (compilerOptions, ts) => {
        const target = compilerOptions.target || ts.ScriptTarget.ES5;
        const lib = compilerOptions.lib || [];
        const files = [
            'lib.d.ts',
            'lib.dom.d.ts',
            'lib.dom.iterable.d.ts',
            'lib.webworker.d.ts',
            'lib.webworker.importscripts.d.ts',
            'lib.scripthost.d.ts',
            'lib.es5.d.ts',
            'lib.es6.d.ts',
            'lib.es2015.collection.d.ts',
            'lib.es2015.core.d.ts',
            'lib.es2015.d.ts',
            'lib.es2015.generator.d.ts',
            'lib.es2015.iterable.d.ts',
            'lib.es2015.promise.d.ts',
            'lib.es2015.proxy.d.ts',
            'lib.es2015.reflect.d.ts',
            'lib.es2015.symbol.d.ts',
            'lib.es2015.symbol.wellknown.d.ts',
            'lib.es2016.array.include.d.ts',
            'lib.es2016.d.ts',
            'lib.es2016.full.d.ts',
            'lib.es2017.d.ts',
            'lib.es2017.full.d.ts',
            'lib.es2017.intl.d.ts',
            'lib.es2017.object.d.ts',
            'lib.es2017.sharedmemory.d.ts',
            'lib.es2017.string.d.ts',
            'lib.es2017.typedarrays.d.ts',
            'lib.es2018.asyncgenerator.d.ts',
            'lib.es2018.asynciterable.d.ts',
            'lib.es2018.d.ts',
            'lib.es2018.full.d.ts',
            'lib.es2018.intl.d.ts',
            'lib.es2018.promise.d.ts',
            'lib.es2018.regexp.d.ts',
            'lib.es2019.array.d.ts',
            'lib.es2019.d.ts',
            'lib.es2019.full.d.ts',
            'lib.es2019.object.d.ts',
            'lib.es2019.string.d.ts',
            'lib.es2019.symbol.d.ts',
            'lib.es2020.d.ts',
            'lib.es2020.full.d.ts',
            'lib.es2020.string.d.ts',
            'lib.es2020.symbol.wellknown.d.ts',
            'lib.esnext.array.d.ts',
            'lib.esnext.asynciterable.d.ts',
            'lib.esnext.bigint.d.ts',
            'lib.esnext.d.ts',
            'lib.esnext.full.d.ts',
            'lib.esnext.intl.d.ts',
            'lib.esnext.symbol.d.ts',
        ];
        const targetToCut = ts.ScriptTarget[target];
        const matches = files.filter(f => f.startsWith(`lib.${targetToCut.toLowerCase()}`));
        const targetCutIndex = files.indexOf(matches.pop());
        const getMax = (array) => array && array.length ? array.reduce((max, current) => (current > max ? current : max)) : undefined;
        // Find the index for everything in
        const indexesForCutting = lib.map(lib => {
            const matches = files.filter(f => f.startsWith(`lib.${lib.toLowerCase()}`));
            if (matches.length === 0)
                return 0;
            const cutIndex = files.indexOf(matches.pop());
            return cutIndex;
        });
        const libCutIndex = getMax(indexesForCutting) || 0;
        const finalCutIndex = Math.max(targetCutIndex, libCutIndex);
        return files.slice(0, finalCutIndex + 1);
    };
    /**
     * Sets up a Map with lib contents by grabbing the necessary files from
     * the local copy of typescript via the file system.
     */
    exports.createDefaultMapFromNodeModules = (compilerOptions) => {
        const ts = require('typescript');
        const path = require('path');
        const fs = require('fs');
        const getLib = (name) => {
            const lib = path.dirname(require.resolve('typescript'));
            return fs.readFileSync(path.join(lib, name), 'utf8');
        };
        const libs = exports.knownLibFilesForCompilerOptions(compilerOptions, ts);
        const fsMap = new Map();
        libs.forEach(lib => {
            fsMap.set('/' + lib, getLib(lib));
        });
        return fsMap;
    };
    /**
     * Create a virtual FS Map with the lib files from a particular TypeScript
     * version based on the target, Always includes dom ATM.
     *
     * @param options The compiler target, which dictates the libs to set up
     * @param version the versions of TypeScript which are supported
     * @param cache should the values be stored in local storage
     * @param ts a copy of the typescript import
     * @param lzstring an optional copy of the lz-string import
     * @param fetcher an optional replacement for the global fetch function (tests mainly)
     * @param storer an optional replacement for the localStorage global (tests mainly)
     */
    exports.createDefaultMapFromCDN = (options, version, cache, ts, lzstring, fetcher, storer) => {
        const fetchlike = fetcher || fetch;
        const storelike = storer || localStorage;
        const fsMap = new Map();
        const files = exports.knownLibFilesForCompilerOptions(options, ts);
        const prefix = `https://typescript.azureedge.net/cdn/${version}/typescript/lib/`;
        function zip(str) {
            return lzstring ? lzstring.compressToUTF16(str) : str;
        }
        function unzip(str) {
            return lzstring ? lzstring.decompressFromUTF16(str) : str;
        }
        // Map the known libs to a node fetch promise, then return the contents
        function uncached() {
            return Promise.all(files.map(lib => fetchlike(prefix + lib).then(resp => resp.text()))).then(contents => {
                contents.forEach((text, index) => fsMap.set('/' + files[index], text));
            });
        }
        // A localstorage and lzzip aware version of the lib files
        function cached() {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                // Remove anything which isn't from this version
                if (key.startsWith('ts-lib-') && !key.startsWith('ts-lib-' + version)) {
                    storelike.removeItem(key);
                }
            });
            return Promise.all(files.map(lib => {
                const cacheKey = `ts-lib-${version}-${lib}`;
                const content = storelike.getItem(cacheKey);
                if (!content) {
                    // Make the API call and store the text concent in the cache
                    return fetchlike(prefix + lib)
                        .then(resp => resp.text())
                        .then(t => {
                        storelike.setItem(cacheKey, zip(t));
                        return t;
                    });
                }
                else {
                    return Promise.resolve(unzip(content));
                }
            })).then(contents => {
                contents.forEach((text, index) => {
                    const name = '/' + files[index];
                    fsMap.set(name, text);
                });
            });
        }
        const func = cache ? cached : uncached;
        return func().then(() => fsMap);
    };
    // TODO: Add some kind of debug logger (needs to be compat with sandbox's deployment, not just via npm)
    function notImplemented(methodName) {
        throw new Error(`Method '${methodName}' is not implemented.`);
    }
    function audit(name, fn) {
        return (...args) => {
            const res = fn(...args);
            const smallres = typeof res === 'string' ? res.slice(0, 80) + '...' : res;
            debugLog('> ' + name, ...args);
            debugLog('< ' + smallres);
            return res;
        };
    }
    /** The default compiler options if TypeScript could ever change the compiler options */
    const defaultCompilerOptions = (ts) => {
        return Object.assign(Object.assign({}, ts.getDefaultCompilerOptions()), { jsx: ts.JsxEmit.React, strict: true, esModuleInterop: true, module: ts.ModuleKind.ESNext, suppressOutputPathCheck: true, skipLibCheck: true, skipDefaultLibCheck: true, moduleResolution: ts.ModuleResolutionKind.NodeJs });
    };
    // "/DOM.d.ts" => "/lib.dom.d.ts"
    const libize = (path) => path.replace('/', '/lib.').toLowerCase();
    /**
     * Creates an in-memory System object which can be used in a TypeScript program, this
     * is what provides read/write aspects of the virtual fs
     */
    function createSystem(files) {
        files = new Map(files);
        return {
            args: [],
            createDirectory: () => notImplemented('createDirectory'),
            // TODO: could make a real file tree
            directoryExists: audit('directoryExists', directory => {
                return Array.from(files.keys()).some(path => path.startsWith(directory));
            }),
            exit: () => notImplemented('exit'),
            fileExists: audit('fileExists', fileName => files.has(fileName) || files.has(libize(fileName))),
            getCurrentDirectory: () => '/',
            getDirectories: () => [],
            getExecutingFilePath: () => notImplemented('getExecutingFilePath'),
            readDirectory: audit('readDirectory', directory => (directory === '/' ? Array.from(files.keys()) : [])),
            readFile: audit('readFile', fileName => files.get(fileName) || files.get(libize(fileName))),
            resolvePath: path => path,
            newLine: '\n',
            useCaseSensitiveFileNames: true,
            write: () => notImplemented('write'),
            writeFile: (fileName, contents) => {
                files.set(fileName, contents);
            },
        };
    }
    exports.createSystem = createSystem;
    /**
     * Creates an in-memory CompilerHost -which is essentially an extra wrapper to System
     * which works with TypeScript objects - returns both a compiler host, and a way to add new SourceFile
     * instances to the in-memory file system.
     */
    function createVirtualCompilerHost(sys, compilerOptions, ts) {
        const sourceFiles = new Map();
        const save = (sourceFile) => {
            sourceFiles.set(sourceFile.fileName, sourceFile);
            return sourceFile;
        };
        const vHost = {
            compilerHost: Object.assign(Object.assign({}, sys), { getCanonicalFileName: fileName => fileName, getDefaultLibFileName: () => '/' + ts.getDefaultLibFileName(compilerOptions), 
                // getDefaultLibLocation: () => '/',
                getDirectories: () => [], getNewLine: () => sys.newLine, getSourceFile: fileName => {
                    return (sourceFiles.get(fileName) ||
                        save(ts.createSourceFile(fileName, sys.readFile(fileName), compilerOptions.target || defaultCompilerOptions(ts).target, false)));
                }, useCaseSensitiveFileNames: () => sys.useCaseSensitiveFileNames }),
            updateFile: sourceFile => {
                const alreadyExists = sourceFiles.has(sourceFile.fileName);
                sys.writeFile(sourceFile.fileName, sourceFile.text);
                sourceFiles.set(sourceFile.fileName, sourceFile);
                return alreadyExists;
            },
        };
        return vHost;
    }
    exports.createVirtualCompilerHost = createVirtualCompilerHost;
    /**
     * Creates an object which can host a language service against the virtual file-system
     */
    function createVirtualLanguageServiceHost(sys, rootFiles, compilerOptions, ts) {
        const fileNames = [...rootFiles];
        const { compilerHost, updateFile } = createVirtualCompilerHost(sys, compilerOptions, ts);
        const fileVersions = new Map();
        let projectVersion = 0;
        const languageServiceHost = Object.assign(Object.assign({}, compilerHost), { getProjectVersion: () => projectVersion.toString(), getCompilationSettings: () => compilerOptions, getScriptFileNames: () => fileNames, getScriptSnapshot: fileName => {
                const contents = sys.readFile(fileName);
                if (contents) {
                    return ts.ScriptSnapshot.fromString(contents);
                }
                return;
            }, getScriptVersion: fileName => {
                return fileVersions.get(fileName) || '0';
            }, writeFile: sys.writeFile });
        const lsHost = {
            languageServiceHost,
            updateFile: sourceFile => {
                projectVersion++;
                fileVersions.set(sourceFile.fileName, projectVersion.toString());
                if (!fileNames.includes(sourceFile.fileName)) {
                    fileNames.push(sourceFile.fileName);
                }
                updateFile(sourceFile);
            },
        };
        return lsHost;
    }
    exports.createVirtualLanguageServiceHost = createVirtualLanguageServiceHost;
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZXNjcmlwdC12ZnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zYW5kYm94L3NyYy92ZW5kb3IvdHlwZXNjcmlwdC12ZnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0lBT0EsTUFBTSxlQUFlLEdBQUcsT0FBTyxZQUFZLEtBQUssV0FBVyxDQUFBO0lBQzNELE1BQU0sVUFBVSxHQUFHLE9BQU8sT0FBTyxLQUFLLFdBQVcsQ0FBQTtJQUNqRCxNQUFNLFdBQVcsR0FBRyxDQUFDLGVBQWUsSUFBSSxZQUFZLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUMzRyxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBYyxFQUFFLEdBQUcsZUFBc0IsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFBO0lBVTlGOzs7Ozs7OztPQVFHO0lBRUgsU0FBZ0Isa0NBQWtDLENBQ2hELEdBQVcsRUFDWCxTQUFtQixFQUNuQixFQUFNLEVBQ04sa0JBQW1DLEVBQUU7UUFFckMsTUFBTSxrQkFBa0IsbUNBQVEsc0JBQXNCLENBQUMsRUFBRSxDQUFDLEdBQUssZUFBZSxDQUFFLENBQUE7UUFFaEYsTUFBTSxFQUFFLG1CQUFtQixFQUFFLFVBQVUsRUFBRSxHQUFHLGdDQUFnQyxDQUFDLEdBQUcsRUFBRSxTQUFTLEVBQUUsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLENBQUE7UUFDcEgsTUFBTSxlQUFlLEdBQUcsRUFBRSxDQUFDLHFCQUFxQixDQUFDLG1CQUFtQixDQUFDLENBQUE7UUFDckUsTUFBTSxXQUFXLEdBQUcsZUFBZSxDQUFDLDZCQUE2QixFQUFFLENBQUE7UUFFbkUsSUFBSSxXQUFXLENBQUMsTUFBTSxFQUFFO1lBQ3RCLE1BQU0sWUFBWSxHQUFH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SUFBSSxRQUFRLEVBQUU7b0JBQ1osT0FBTyxFQUFFLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQTtpQkFDOUM7Z0JBQ0QsT0FBTTtZQUNSLENBQUMsRUFDRCxnQkFBZ0IsRUFBRSxRQUFRLENBQUMsRUFBRTtnQkFDM0IsT0FBTyxZQUFZLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEdBQUcsQ0FBQTtZQUMxQyxDQUFDLEVBQ0QsU0FBUyxFQUFFLEdBQUcsQ0FBQyxTQUFTLEdBQ3pCLENBQUE7UUFPRCxNQUFNLE1BQU0sR0FBVztZQUNyQixtQkFBbUI7WUFDbkIsVUFBVSxFQUFFLFVBQVUsQ0FBQyxFQUFFO2dCQUN2QixjQUFjLEVBQUUsQ0FBQTtnQkFDaEIsWUFBWSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLGNBQWMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFBO2dCQUNoRSxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUU7b0JBQzVDLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFBO2lCQUNwQztnQkFDRCxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUE7WUFDeEIsQ0FBQztTQUNGLENBQUE7UUFDRCxPQUFPLE1BQU0sQ0FBQTtJQUNmLENBQUM7SUE3Q0QsNEVBNkNDIiwic291cmNlc0NvbnRlbnQiOlsidHlwZSBTeXN0ZW0gPSBpbXBvcnQoJ3R5cGVzY3JpcHQnKS5TeXN0ZW1cbnR5cGUgQ29tcGlsZXJPcHRpb25zID0gaW1wb3J0KCd0eXBlc2NyaXB0JykuQ29tcGlsZXJPcHRpb25zXG50eXBlIExhbmd1YWdlU2VydmljZUhvc3QgPSBpbXBvcnQoJ3R5cGVzY3JpcHQnKS5MYW5ndWFnZVNlcnZpY2VIb3N0XG50eXBlIENvbXBpbGVySG9zdCA9IGltcG9ydCgndHlwZXNjcmlwdCcpLkNvbXBpbGVySG9zdFxudHlwZSBTb3VyY2VGaWxlID0gaW1wb3J0KCd0eXBlc2NyaXB0JykuU291cmNlRmlsZVxudHlwZSBUUyA9IHR5cGVvZiBpbXBvcnQoJ3R5cGVzY3JpcHQnKVxuXG5jb25zdCBoYXNMb2NhbFN0b3JhZ2UgPSB0eXBlb2YgbG9jYWxTdG9yYWdlICE9PSBgdW5kZWZpbmVkYFxuY29uc3QgaGFzUHJvY2VzcyA9IHR5cGVvZiBwcm9jZXNzICE9PSBgdW5kZWZpbmVkYFxuY29uc3Qgc2hvdWxkRGVidWcgPSAoaGFzTG9jYWxTdG9yYWdlICYmIGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdERUJVRycpKSB8fCAoaGFzUHJvY2VzcyAmJiBwcm9jZXNzLmVudi5ERUJVRylcbmNvbnN0IGRlYnVnTG9nID0gc2hvdWxkRGVidWcgPyBjb25zb2xlLmxvZyA6IChfbWVzc2FnZT86IGFueSwgLi4uX29wdGlvbmFsUGFyYW1zOiBhbnlbXSkgPT4gJydcblxuZXhwb3J0IGludGVyZmFjZSBWaXJ0dWFsVHlwZVNjcmlwdEVudmlyb25tZW50IHtcbiAgc3lzOiBTeXN0ZW1cbiAgbGFuZ3VhZ2VTZXJ2aWNlOiBpbXBvcnQoJ3R5cGVzY3JpcHQnKS5MYW5ndWFnZVNlcnZpY2VcbiAgZ2V0U291cmNlRmlsZTogKGZpbGVOYW1lOiBzdHJpbmcpID0+IGltcG9ydCgndHlwZXNjcmlwdCcpLlNvdXJjZUZpbGUgfCB1bmRlZmluZWRcbiAgY3JlYXRlRmlsZTogKGZpbGVOYW1lOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZykgPT4gdm9pZFxuICB1cGRhdGVGaWxlOiAoZmlsZU5hbWU6IHN0cmluZywgY29udGVudDogc3RyaW5nLCByZXBsYWNlVGV4dFNwYW4/OiBpbXBvcnQoJ3R5cGVzY3JpcHQnKS5UZXh0U3BhbikgPT4gdm9pZFxufVxuXG4vKipcbiAqIE1ha2VzIGEgdmlydHVhbCBjb3B5IG9mIHRoZSBUeXBlU2NyaXB0IGVudmlyb25tZW50LiBUaGlzIGlzIHRoZSBtYWluIEFQSSB5b3Ugd2FudCB0byBiZSB1c2luZyB3aXRoXG4gKiB0eXBlc2NyaXB0LXZmcy4gQSBsb3Qgb2YgdGhlIG90aGVyIGV4cG9zZWQgZnVuY3Rpb25zIGFyZSB1c2VkIGJ5IHRoaXMgZnVuY3Rpb24gdG8gZ2V0IHNldCB1cC5cbiAqXG4gKiBAcGFyYW0gc3lzIGFuIG9iamVjdCB3aGljaCBjb25mb3JtcyB0byB0aGUgVFMgU3lzIChhIHNoaW0gb3ZlciByZWFkL3dyaXRlIGFjY2VzcyB0byB0aGUgZnMpXG4gKiBAcGFyYW0gcm9vdEZpbGVzIGEgbGlzdCBvZiBmaWxlcyB3aGljaCBhcmUgY29uc2lkZXJlZCBpbnNpZGUgdGhlIHByb2plY3RcbiAqIEBwYXJhbSB0cyBhIGNvcHkgcGYgdGhlIFR5cGVTY3JpcHQgbW9kdWxlXG4gKiBAcGFyYW0gY29tcGlsZXJPcHRpb25zIHRoZSBvcHRpb25zIGZvciB0aGlzIGNvbXBpbGVyIHJ1blxuICovXG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVWaXJ0dWFsVHlwZVNjcmlwdEVudmlyb25tZW50KFxuICBzeXM6IFN5c3RlbSxcbiAgcm9vdEZpbGVzOiBzdHJpbmdbXSxcbiAgdHM6IFRTLFxuICBjb21waWxlck9wdGlvbnM6IENvbXBpbGVyT3B0aW9ucyA9IHt9XG4pOiBWaXJ0dWFsVHlwZVNjcmlwdEVudmlyb25tZW50IHtcbiAgY29uc3QgbWVyZ2VkQ29tcGlsZXJPcHRzID0geyAuLi5kZWZhdWx0Q29tcGlsZXJPcHRpb25zKHRzKSwgLi4uY29tcGlsZXJPcHRpb25zIH1cblxuICBjb25zdCB7IGxhbmd1YWdlU2VydmljZUhvc3QsIHVwZGF0ZUZpbGUgfSA9IGNyZWF0ZVZpcnR1YWxMYW5ndWFnZVNlcnZpY2VIb3N0KHN5cywgcm9vdEZpbGVzLCBtZXJnZWRDb21waWxlck9wdHMsIHRzKVxuICBjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSB0cy5jcmVhdGVMYW5ndWFnZVNlcnZpY2UobGFuZ3VhZ2VTZXJ2aWNlSG9zdClcbiAgY29uc3QgZGlhZ25vc3RpY3MgPSBsYW5ndWFnZVNlcnZpY2UuZ2V0Q29tcGlsZXJPcHRpb25zRGlhZ25vc3RpY3MoKVxuXG4gIGlmIChkaWFnbm9zdGljcy5sZW5ndGgpIHtcbiAgICBjb25zdCBjb21waWxlckhvc3QgPSBjcmVhdGVWaXJ0dWFsQ29tcGlsZXJIb3N0KHN5cywgY29tcGlsZXJPcHRpb25zLCB0cylcbiAgICB0aHJvdyBuZXcgRXJyb3IodHMuZm9ybWF0RGlhZ25vc3RpY3MoZGlhZ25vc3RpY3MsIGNvbXBpbGVySG9zdC5jb21waWxlckhvc3QpKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzeXMsXG4gICAgbGFuZ3VhZ2VTZXJ2aWNlLFxuICAgIGdldFNvdXJjZUZpbGU6IGZpbGVOYW1lID0+IGxhbmd1YWdlU2VydmljZS5nZXRQcm9ncmFtKCk/LmdldFNvdXJjZUZpbGUoZmlsZU5hbWUpLFxuXG4gICAgY3JlYXRlRmlsZTogKGZpbGVOYW1lLCBjb250ZW50KSA9PiB7XG4gICAgICB1cGRhdGVGaWxlKHRzLmNyZWF0ZVNvdXJjZUZpbGUoZmlsZU5hbWUsIGNvbnRlbnQsIG1lcmdlZENvbXBpbGVyT3B0cy50YXJnZXQhLCBmYWxzZSkpXG4gICAgfSxcbiAgICB1cGRhdGVGaWxlOiAoZmlsZU5hbWUsIGNvbnRlbnQsIG9wdFByZXZUZXh0U3BhbikgPT4ge1xuICAgICAgY29uc3QgcHJldlNvdXJjZUZpbGUgPSBsYW5ndWFnZVNlcnZpY2UuZ2V0UHJvZ3JhbSgpIS5nZXRTb3VyY2VGaWxlKGZpbGVOYW1lKSFcbiAgICAgIGNvbnN0IHByZXZGdWxsQ29udGVudHMgPSBwcmV2U291cmNlRmlsZS50ZXh0XG5cbiAgICAgIC8vIFRPRE86IFZhbGlkYXRlIGlmIHRoZSBkZWZhdWx0IHRleHQgc3BhbiBoYXMgYSBmZW5jZXBvc3QgZXJyb3I/XG4gICAgICBjb25zdCBwcmV2VGV4dFNwYW4gPSBvcHRQcmV2VGV4dFNwYW4gPz8gdHMuY3JlYXRlVGV4dFNwYW4oMCwgcHJldkZ1bGxDb250ZW50cy5sZW5ndGgpXG4gICAgICBjb25zdCBuZXdUZXh0ID1cbiAgICAgICAgcHJldkZ1bGxDb250ZW50cy5zbGljZSgwLCBwcmV2VGV4dFNwYW4uc3RhcnQpICtcbiAgICAgICAgY29udGVudCArXG4gICAgICAgIHByZXZGdWxsQ29udGVudHMuc2xpY2UocHJldlRleHRTcGFuLnN0YXJ0ICsgcHJldlRleHRTcGFuLmxlbmd0aClcbiAgICAgIGNvbnN0IG5ld1NvdXJjZUZpbGUgPSB0cy51cGRhdGVTb3VyY2VGaWxlKHByZXZTb3VyY2VGaWxlLCBuZXdUZXh0LCB7XG4gICAgICAgIHNwYW46IHByZXZUZXh0U3BhbixcbiAgICAgICAgbmV3TGVuZ3RoOiBjb250ZW50Lmxlbmd0aCxcbiAgICAgIH0pXG5cbiAgICAgIHVwZGF0ZUZpbGUobmV3U291cmNlRmlsZSlcbiAgICB9LFxuICB9XG59XG5cbi8qKlxuICogR3JhYiB0aGUgbGlzdCBvZiBsaWIgZmlsZXMgZm9yIGEgcGFydGljdWxhciB0YXJnZXQsIHdpbGwgcmV0dXJuIGEgYml0IG1vcmUgdGhhbiBuZWNlc3NhcnkgKGJ5IGluY2x1ZGluZ1xuICogdGhlIGRvbSkgYnV0IHRoYXQncyBPS1xuICpcbiAqIEBwYXJhbSB0YXJnZXQgVGhlIGNvbXBpbGVyIHNldHRpbmdzIHRhcmdldCBiYXNlbGluZVxuICogQHBhcmFtIHRzIEEgY29weSBvZiB0aGUgVHlwZVNjcmlwdCBtb2R1bGVcbiAqL1xuZXhwb3J0IGNvbnN0IGtub3duTGliRmlsZXNGb3JDb21waWxlck9wdGlvbnMgPSAoY29tcGlsZXJPcHRpb25zOiBDb21waWxlck9wdGlvbnMsIHRzOiBUUykgPT4ge1xuICBjb25zdCB0YXJnZXQgPSBjb21waWxlck9wdGlvbnMudGFyZ2V0IHx8IHRzLlNjcmlwdFRhcmdldC5FUzVcbiAgY29uc3QgbGliID0gY29tcGlsZXJPcHRpb25zLmxpYiB8fCBbXVxuXG4gIGNvbnN0IGZpbGVzID0gW1xuICAgICdsaWIuZC50cycsXG4gICAgJ2xpYi5kb20uZC50cycsXG4gICAgJ2xpYi5kb20uaXRlcmFibGUuZC50cycsXG4gICAgJ2xpYi53ZWJ3b3JrZXIuZC50cycsXG4gICAgJ2xpYi53ZWJ3b3JrZXIuaW1wb3J0c2NyaXB0cy5kLnRzJyxcbiAgICAnbGliLnNjcmlwdGhvc3QuZC50cycsXG4gICAgJ2xpYi5lczUuZC50cycsXG4gICAgJ2xpYi5lczYuZC50cycsXG4gICAgJ2xpYi5lczIwMTUuY29sbGVjdGlvbi5kLnRzJyxcbiAgICAnbGliLmVzMjAxNS5jb3JlLmQudHMnLFxuICAgICdsaWIuZXMyMDE1LmQudHMnLFxuICAgICdsaWIuZXMyMDE1LmdlbmVyYXRvci5kLnRzJyxcbiAgICAnbGliLmVzMjAxNS5pdGVyYWJsZS5kLnRzJyxcbiAgICAnbGliLmVzMjAxNS5wcm9taXNlLmQudHMnLFxuICAgICdsaWIuZXMyMDE1LnByb3h5LmQudHMnLFxuICAgICdsaWIuZXMyMDE1LnJlZmxlY3QuZC50cycsXG4gICAgJ2xpYi5lczIwMTUuc3ltYm9sLmQudHMnLFxuICAgICdsaWIuZXMyMDE1LnN5bWJvbC53ZWxsa25vd24uZC50cycsXG4gICAgJ2xpYi5lczIwMTYuYXJyYXkuaW5jbHVkZS5kLnRzJyxcbiAgICAnbGliLmVzMjAxNi5kLnRzJyxcbiAgICAnbGliLmVzMjAxNi5mdWxsLmQudHMnLFxuICAgICdsaWIuZXMyMDE3LmQudHMnLFxuICAgICdsaWIuZXMyMDE3LmZ1bGwuZC50cycsXG4gICAgJ2xpYi5lczIwMTcuaW50bC5kLnRzJyxcbiAgICAnbGliLmVzMjAxNy5vYmplY3QuZC50cycsXG4gICAgJ2xpYi5lczIwMTcuc2hhcmVkbWVtb3J5LmQudHMnLFxuICAgICdsaWIuZXMyMDE3LnN0cmluZy5kLnRzJyxcbiAgICAnbGliLmVzMjAxNy50eXBlZGFycmF5cy5kLnRzJyxcbiAgICAnbGliLmVzMjAxOC5hc3luY2dlbmVyYXRvci5kLnRzJyxcbiAgICAnbGliLmVzMjAxOC5hc3luY2l0ZXJhYmxlLmQudHMnLFxuICAgICdsaWIuZXMyMDE4LmQudHMnLFxuICAgICdsaWIuZXMyMDE4LmZ1bGwuZC50cycsXG4gICAgJ2xpYi5lczIwMTguaW50bC5kLnRzJyxcbiAgICAnbGliLmVzMjAxOC5wcm9taXNlLmQudHMnLFxuICAgICdsaWIuZXMyMDE4LnJlZ2V4cC5kLnRzJyxcbiAgICAnbGliLmVzMjAxOS5hcnJheS5kLnRzJyxcbiAgICAnbGliLmVzMjAxOS5kLnRzJyxcbiAgICAnbGliLmVzMjAxOS5mdWxsLmQudHMnLFxuICAgICdsaWIuZXMyMDE5Lm9iamVjdC5kLnRzJyxcbiAgICAnbGliLmVzMjAxOS5zdHJpbmcuZC50cycsXG4gICAgJ2xpYi5lczIwMTkuc3ltYm9sLmQudHMnLFxuICAgICdsaWIuZXMyMDIwLmQudHMnLFxuICAgICdsaWIuZXMyMDIwLmZ1bGwuZC50cycsXG4gICAgJ2xpYi5lczIwMjAuc3RyaW5nLmQudHMnLFxuICAgICdsaWIuZXMyMDIwLnN5bWJvbC53ZWxsa25vd24uZC50cycsXG4gICAgJ2xpYi5lc25leHQuYXJyYXkuZC50cycsXG4gICAgJ2xpYi5lc25leHQuYXN5bmNpdGVyYWJsZS5kLnRzJyxcbiAgICAnbGliLmVzbmV4dC5iaWdpbnQuZC50cycsXG4gICAgJ2xpYi5lc25leHQuZC50cycsXG4gICAgJ2xpYi5lc25leHQuZnVsbC5kLnRzJyxcbiAgICAnbGliLmVzbmV4dC5pbnRsLmQudHMnLFxuICAgICdsaWIuZXNuZXh0LnN5bWJvbC5kLnRzJyxcbiAgXVxuXG4gIGNvbnN0IHRhcmdldFRvQ3V0ID0gdHMuU2NyaXB0VGFyZ2V0W3RhcmdldF1cbiAgY29uc3QgbWF0Y2hlcyA9IGZpbGVzLmZpbHRlcihmID0+IGYuc3RhcnRzV2l0aChgbGliLiR7dGFyZ2V0VG9DdXQudG9Mb3dlckNhc2UoKX1gKSlcbiAgY29uc3QgdGFyZ2V0Q3V0SW5kZXggPSBmaWxlcy5pbmRleE9mKG1hdGNoZXMucG9wKCkhKVxuXG4gIGNvbnN0IGdldE1heCA9IChhcnJheTogbnVtYmVyW10pID0+XG4gICAgYXJyYXkgJiYgYXJyYXkubGVuZ3RoID8gYXJyYXkucmVkdWNlKChtYXgsIGN1cnJlbnQpID0+IChjdXJyZW50ID4gbWF4ID8gY3VycmVudCA6IG1heCkpIDogdW5kZWZpbmVkXG5cbiAgLy8gRmluZCB0aGUgaW5kZXggZm9yIGV2ZXJ5dGhpbmcgaW5cbiAgY29uc3QgaW5kZXhlc0ZvckN1dHRpbmcgPSBsaWIubWFwKGxpYiA9PiB7XG4gICAgY29uc3QgbWF0Y2hlcyA9IGZpbGVzLmZpbHRlcihmID0+IGYuc3RhcnRzV2l0aChgbGliLiR7bGliLnRvTG93ZXJDYXNlKCl9YCkpXG4gICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSByZXR1cm4gMFxuXG4gICAgY29uc3QgY3V0SW5kZXggPSBmaWxlcy5pbmRleE9mKG1hdGNoZXMucG9wKCkhKVxuICAgIHJldHVybiBjdXRJbmRleFxuICB9KVxuXG4gIGNvbnN0IGxpYkN1dEluZGV4ID0gZ2V0TWF4KGluZGV4ZXNGb3JDdXR0aW5nKSB8fCAwXG5cbiAgY29uc3QgZmluYWxDdXRJbmRleCA9IE1hdGgubWF4KHRhcmdldEN1dEluZGV4LCBsaWJDdXRJbmRleClcbiAgcmV0dXJuIGZpbGVzLnNsaWNlKDAsIGZpbmFsQ3V0SW5kZXggKyAxKVxufVxuXG4vKipcbiAqIFNldHMgdXAgYSBNYXAgd2l0aCBsaWIgY29udGVudHMgYnkgZ3JhYmJpbmcgdGhlIG5lY2Vzc2FyeSBmaWxlcyBmcm9tXG4gKiB0aGUgbG9jYWwgY29weSBvZiB0eXBlc2NyaXB0IHZpYSB0aGUgZmlsZSBzeXN0ZW0uXG4gKi9cbmV4cG9ydCBjb25zdCBjcmVhdGVEZWZhdWx0TWFwRnJvbU5vZGVNb2R1bGVzID0gKGNvbXBpbGVyT3B0aW9uczogQ29tcGlsZXJPcHRpb25zKSA9PiB7XG4gIGNvbnN0IHRzID0gcmVxdWlyZSgndHlwZXNjcmlwdCcpXG4gIGNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJylcbiAgY29uc3QgZnMgPSByZXF1aXJlKCdmcycpXG5cbiAgY29uc3QgZ2V0TGliID0gKG5hbWU6IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IGxpYiA9IHBhdGguZGlybmFtZShyZXF1aXJlLnJlc29sdmUoJ3R5cGVzY3JpcHQnKSlcbiAgICByZXR1cm4gZnMucmVhZEZpbGVTeW5jKHBhdGguam9pbihsaWIsIG5hbWUpLCAndXRmOCcpXG4gIH1cblxuICBjb25zdCBsaWJzID0ga25vd25MaWJGaWxlc0ZvckNvbXBpbGVyT3B0aW9ucyhjb21waWxlck9wdGlvbnMsIHRzKVxuICBjb25zdCBmc01hcCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KClcbiAgbGlicy5mb3JFYWNoKGxpYiA9PiB7XG4gICAgZnNNYXAuc2V0KCcvJyArIGxpYiwgZ2V0TGliKGxpYikpXG4gIH0pXG4gIHJldHVybiBmc01hcFxufVxuXG4vKipcbiAqIENyZWF0ZSBhIHZpcnR1YWwgRlMgTWFwIHdpdGggdGhlIGxpYiBmaWxlcyBmcm9tIGEgcGFydGljdWxhciBUeXBlU2NyaXB0XG4gKiB2ZXJzaW9uIGJhc2VkIG9uIHRoZSB0YXJnZXQsIEFsd2F5cyBpbmNsdWRlcyBkb20gQVRNLlxuICpcbiAqIEBwYXJhbSBvcHRpb25zIFRoZSBjb21waWxlciB0YXJnZXQsIHdoaWNoIGRpY3RhdGVzIHRoZSBsaWJzIHRvIHNldCB1cFxuICogQHBhcmFtIHZlcnNpb24gdGhlIHZlcnNpb25zIG9mIFR5cGVTY3JpcHQgd2hpY2ggYXJlIHN1cHBvcnRlZFxuICogQHBhcmFtIGNhY2hlIHNob3VsZCB0aGUgdmFsdWVzIGJlIHN0b3JlZCBpbiBsb2NhbCBzdG9yYWdlXG4gKiBAcGFyYW0gdHMgYSBjb3B5IG9mIHRoZSB0eXBlc2NyaXB0IGltcG9ydFxuICogQHBhcmFtIGx6c3RyaW5nIGFuIG9wdGlvbmFsIGNvcHkgb2YgdGhlIGx6LXN0cmluZyBpbXBvcnRcbiAqIEBwYXJhbSBmZXRjaGVyIGFuIG9wdGlvbmFsIHJlcGxhY2VtZW50IGZvciB0aGUgZ2xvYmFsIGZldGNoIGZ1bmN0aW9uICh0ZXN0cyBtYWlubHkpXG4gKiBAcGFyYW0gc3RvcmVyIGFuIG9wdGlvbmFsIHJlcGxhY2VtZW50IGZvciB0aGUgbG9jYWxTdG9yYWdlIGdsb2JhbCAodGVzdHMgbWFpbmx5KVxuICovXG5leHBvcnQgY29uc3QgY3JlYXRlRGVmYXVsdE1hcEZyb21DRE4gPSAoXG4gIG9wdGlvbnM6IENvbXBpbGVyT3B0aW9ucyxcbiAgdmVyc2lvbjogc3RyaW5nLFxuICBjYWNoZTogYm9vbGVhbixcbiAgdHM6IFRTLFxuICBsenN0cmluZz86IHR5cGVvZiBpbXBvcnQoJ2x6LXN0cmluZycpLFxuICBmZXRjaGVyPzogdHlwZW9mIGZldGNoLFxuICBzdG9yZXI/OiB0eXBlb2YgbG9jYWxTdG9yYWdlXG4pID0+IHtcbiAgY29uc3QgZmV0Y2hsaWtlID0gZmV0Y2hlciB8fCBmZXRjaFxuICBjb25zdCBzdG9yZWxpa2UgPSBzdG9yZXIgfHwgbG9jYWxTdG9yYWdlXG4gIGNvbnN0IGZzTWFwID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKVxuICBjb25zdCBmaWxlcyA9IGtub3duTGliRmlsZXNGb3JDb21waWxlck9wdGlvbnMob3B0aW9ucywgdHMpXG4gIGNvbnN0IHByZWZpeCA9IGBodHRwczovL3R5cGVzY3JpcHQuYXp1cmVlZGdlLm5ldC9jZG4vJHt2ZXJzaW9ufS90eXBlc2NyaXB0L2xpYi9gXG5cbiAgZnVuY3Rpb24gemlwKHN0cjogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGx6c3RyaW5nID8gbHpzdHJpbmcuY29tcHJlc3NUb1VURjE2KHN0cikgOiBzdHJcbiAgfVxuXG4gIGZ1bmN0aW9uIHVuemlwKHN0cjogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGx6c3RyaW5nID8gbHpzdHJpbmcuZGVjb21wcmVzc0Zyb21VVEYxNihzdHIpIDogc3RyXG4gIH1cblxuICAvLyBNYXAgdGhlIGtub3duIGxpYnMgdG8gYSBub2RlIGZldGNoIHByb21pc2UsIHRoZW4gcmV0dXJuIHRoZSBjb250ZW50c1xuICBmdW5jdGlvbiB1bmNhY2hlZCgpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoZmlsZXMubWFwKGxpYiA9PiBmZXRjaGxpa2UocHJlZml4ICsgbGliKS50aGVuKHJlc3AgPT4gcmVzcC50ZXh0KCkpKSkudGhlbihjb250ZW50cyA9PiB7XG4gICAgICBjb250ZW50cy5mb3JFYWNoKCh0ZXh0LCBpbmRleCkgPT4gZnNNYXAuc2V0KCcvJyArIGZpbGVzW2luZGV4XSwgdGV4dCkpXG4gICAgfSlcbiAgfVxuXG4gIC8vIEEgbG9jYWxzdG9yYWdlIGFuZCBsenppcCBhd2FyZSB2ZXJzaW9uIG9mIHRoZSBsaWIgZmlsZXNcbiAgZnVuY3Rpb24gY2FjaGVkKCkge1xuICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhsb2NhbFN0b3JhZ2UpXG4gICAga2V5cy5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAvLyBSZW1vdmUgYW55dGhpbmcgd2hpY2ggaXNuJ3QgZnJvbSB0aGlzIHZlcnNpb25cbiAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgndHMtbGliLScpICYmICFrZXkuc3RhcnRzV2l0aCgndHMtbGliLScgKyB2ZXJzaW9uKSkge1xuICAgICAgICBzdG9yZWxpa2UucmVtb3ZlSXRlbShrZXkpXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgIGZpbGVzLm1hcChsaWIgPT4ge1xuICAgICAgICBjb25zdCBjYWNoZUtleSA9IGB0cy1saWItJHt2ZXJzaW9ufS0ke2xpYn1gXG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBzdG9yZWxpa2UuZ2V0SXRlbShjYWNoZUtleSlcblxuICAgICAgICBpZiAoIWNvbnRlbnQpIHtcbiAgICAgICAgICAvLyBNYWtlIHRoZSBBUEkgY2FsbCBhbmQgc3RvcmUgdGhlIHRleHQgY29uY2VudCBpbiB0aGUgY2FjaGVcbiAgICAgICAgICByZXR1cm4gZmV0Y2hsaWtlKHByZWZpeCArIGxpYilcbiAgICAgICAgICAgIC50aGVuKHJlc3AgPT4gcmVzcC50ZXh0KCkpXG4gICAgICAgICAgICAudGhlbih0ID0+IHtcbiAgICAgICAgICAgICAgc3RvcmVsaWtlLnNldEl0ZW0oY2FjaGVLZXksIHppcCh0KSlcbiAgICAgICAgICAgICAgcmV0dXJuIHRcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bnppcChjb250ZW50KSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApLnRoZW4oY29udGVudHMgPT4ge1xuICAgICAgY29udGVudHMuZm9yRWFjaCgodGV4dCwgaW5kZXgpID0+IHtcbiAgICAgICAgY29uc3QgbmFtZSA9ICcvJyArIGZpbGVzW2luZGV4XVxuICAgICAgICBmc01hcC5zZXQobmFtZSwgdGV4dClcbiAgICAgIH0pXG4gICAgfSlcbiAgfVxuXG4gIGNvbnN0IGZ1bmMgPSBjYWNoZSA/IGNhY2hlZCA6IHVuY2FjaGVkXG4gIHJldHVybiBmdW5jKCkudGhlbigoKSA9PiBmc01hcClcbn1cblxuLy8gVE9ETzogQWRkIHNvbWUga2luZCBvZiBkZWJ1ZyBsb2dnZXIgKG5lZWRzIHRvIGJlIGNvbXBhdCB3aXRoIHNhbmRib3gncyBkZXBsb3ltZW50LCBub3QganVzdCB2aWEgbnBtKVxuXG5mdW5jdGlvbiBub3RJbXBsZW1lbnRlZChtZXRob2ROYW1lOiBzdHJpbmcpOiBhbnkge1xuICB0aHJvdyBuZXcgRXJyb3IoYE1ldGhvZCAnJHttZXRob2ROYW1lfScgaXMgbm90IGltcGxlbWVudGVkLmApXG59XG5cbmZ1bmN0aW9uIGF1ZGl0PEFyZ3NUIGV4dGVuZHMgYW55W10sIFJldHVyblQ+KFxuICBuYW1lOiBzdHJpbmcsXG4gIGZuOiAoLi4uYXJnczogQXJnc1QpID0+IFJldHVyblRcbik6ICguLi5hcmdzOiBBcmdzVCkgPT4gUmV0dXJuVCB7XG4gIHJldHVybiAoLi4uYXJncykgPT4ge1xuICAgIGNvbnN0IHJlcyA9IGZuKC4uLmFyZ3MpXG5cbiAgICBjb25zdCBzbWFsbHJlcyA9IHR5cGVvZiByZXMgPT09ICdzdHJpbmcnID8gcmVzLnNsaWNlKDAsIDgwKSArICcuLi4nIDogcmVzXG4gICAgZGVidWdMb2coJz4gJyArIG5hbWUsIC4uLmFyZ3MpXG4gICAgZGVidWdMb2coJzwgJyArIHNtYWxscmVzKVxuXG4gICAgcmV0dXJuIHJlc1xuICB9XG59XG5cbi8qKiBUaGUgZGVmYXVsdCBjb21waWxlciBvcHRpb25zIGlmIFR5cGVTY3JpcHQgY291bGQgZXZlciBjaGFuZ2UgdGhlIGNvbXBpbGVyIG9wdGlvbnMgKi9cbmNvbnN0IGRlZmF1bHRDb21waWxlck9wdGlvbnMgPSAodHM6IHR5cGVvZiBpbXBvcnQoJ3R5cGVzY3JpcHQnKSk6IENvbXBpbGVyT3B0aW9ucyA9PiB7XG4gIHJldHVybiB7XG4gICAgLi4udHMuZ2V0RGVmYXVsdENvbXBpbGVyT3B0aW9ucygpLFxuICAgIGpzeDogdHMuSnN4RW1pdC5SZWFjdCxcbiAgICBzdHJpY3Q6IHRydWUsXG4gICAgZXNNb2R1bGVJbnRlcm9wOiB0cnVlLFxuICAgIG1vZHVsZTogdHMuTW9kdWxlS2luZC5FU05leHQsXG4gICAgc3VwcHJlc3NPdXRwdXRQYXRoQ2hlY2s6IHRydWUsXG4gICAgc2tpcExpYkNoZWNrOiB0cnVlLFxuICAgIHNraXBEZWZhdWx0TGliQ2hlY2s6IHRydWUsXG4gICAgbW9kdWxlUmVzb2x1dGlvbjogdHMuTW9kdWxlUmVzb2x1dGlvbktpbmQuTm9kZUpzLFxuICB9XG59XG5cbi8vIFwiL0RPTS5kLnRzXCIgPT4gXCIvbGliLmRvbS5kLnRzXCJcbmNvbnN0IGxpYml6ZSA9IChwYXRoOiBzdHJpbmcpID0+IHBhdGgucmVwbGFjZSgnLycsICcvbGliLicpLnRvTG93ZXJDYXNlKClcblxuLyoqXG4gKiBDcmVhdGVzIGFuIGluLW1lbW9yeSBTeXN0ZW0gb2JqZWN0IHdoaWNoIGNhbiBiZSB1c2VkIGluIGEgVHlwZVNjcmlwdCBwcm9ncmFtLCB0aGlzXG4gKiBpcyB3aGF0IHByb3ZpZGVzIHJlYWQvd3JpdGUgYXNwZWN0cyBvZiB0aGUgdmlydHVhbCBmc1xuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU3lzdGVtKGZpbGVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogU3lzdGVtIHtcbiAgZmlsZXMgPSBuZXcgTWFwKGZpbGVzKVxuICByZXR1cm4ge1xuICAgIGFyZ3M6IFtdLFxuICAgIGNyZWF0ZURpcmVjdG9yeTogKCkgPT4gbm90SW1wbGVtZW50ZWQoJ2NyZWF0ZURpcmVjdG9yeScpLFxuICAgIC8vIFRPRE86IGNvdWxkIG1ha2UgYSByZWFsIGZpbGUgdHJlZVxuICAgIGRpcmVjdG9yeUV4aXN0czogYXVkaXQoJ2RpcmVjdG9yeUV4aXN0cycsIGRpcmVjdG9yeSA9PiB7XG4gICAgICByZXR1cm4gQXJyYXkuZnJvbShmaWxlcy5rZXlzKCkpLnNvbWUocGF0aCA9PiBwYXRoLnN0YXJ0c1dpdGgoZGlyZWN0b3J5KSlcbiAgICB9KSxcbiAgICBleGl0OiAoKSA9PiBub3RJbXBsZW1lbnRlZCgnZXhpdCcpLFxuICAgIGZpbGVFeGlzdHM6IGF1ZGl0KCdmaWxlRXhpc3RzJywgZmlsZU5hbWUgPT4gZmlsZXMuaGFzKGZpbGVOYW1lKSB8fCBmaWxlcy5oYXMobGliaXplKGZpbGVOYW1lKSkpLFxuICAgIGdldEN1cnJlbnREaXJlY3Rvcnk6ICgpID0+ICcvJyxcbiAgICBnZXREaXJlY3RvcmllczogKCkgPT4gW10sXG4gICAgZ2V0RXhlY3V0aW5nRmlsZVBhdGg6ICgpID0+IG5vdEltcGxlbWVudGVkKCdnZXRFeGVjdXRpbmdGaWxlUGF0aCcpLFxuICAgIHJlYWREaXJlY3Rvcnk6IGF1ZGl0KCdyZWFkRGlyZWN0b3J5JywgZGlyZWN0b3J5ID0+IChkaXJlY3RvcnkgPT09ICcvJyA/IEFycmF5LmZyb20oZmlsZXMua2V5cygpKSA6IFtdKSksXG4gICAgcmVhZEZpbGU6IGF1ZGl0KCdyZWFkRmlsZScsIGZpbGVOYW1lID0+IGZpbGVzLmdldChmaWxlTmFtZSkgfHwgZmlsZXMuZ2V0KGxpYml6ZShmaWxlTmFtZSkpKSxcbiAgICByZXNvbHZlUGF0aDogcGF0aCA9PiBwYXRoLFxuICAgIG5ld0xpbmU6ICdcXG4nLFxuICAgIHVzZUNhc2VTZW5zaXRpdmVGaWxlTmFtZXM6IHRydWUsXG4gICAgd3JpdGU6ICgpID0+IG5vdEltcGxlbWVudGVkKCd3cml0ZScpLFxuICAgIHdyaXRlRmlsZTogKGZpbGVOYW1lLCBjb250ZW50cykgPT4ge1xuICAgICAgZmlsZXMuc2V0KGZpbGVOYW1lLCBjb250ZW50cylcbiAgICB9LFxuICB9XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBpbi1tZW1vcnkgQ29tcGlsZXJIb3N0IC13aGljaCBpcyBlc3NlbnRpYWxseSBhbiBleHRyYSB3cmFwcGVyIHRvIFN5c3RlbVxuICogd2hpY2ggd29ya3Mgd2l0aCBUeXBlU2NyaXB0IG9iamVjdHMgLSByZXR1cm5zIGJvdGggYSBjb21waWxlciBob3N0LCBhbmQgYSB3YXkgdG8gYWRkIG5ldyBTb3VyY2VGaWxlXG4gKiBpbnN0YW5jZXMgdG8gdGhlIGluLW1lbW9yeSBmaWxlIHN5c3RlbS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVZpcnR1YWxDb21waWxlckhvc3Qoc3lzOiBTeXN0ZW0sIGNvbXBpbGVyT3B0aW9uczogQ29tcGlsZXJPcHRpb25zLCB0czogVFMpIHtcbiAgY29uc3Qgc291cmNlRmlsZXMgPSBuZXcgTWFwPHN0cmluZywgU291cmNlRmlsZT4oKVxuICBjb25zdCBzYXZlID0gKHNvdXJjZUZpbGU6IFNvdXJjZUZpbGUpID0+IHtcbiAgICBzb3VyY2VGaWxlcy5zZXQoc291cmNlRmlsZS5maWxlTmFtZSwgc291cmNlRmlsZSlcbiAgICByZXR1cm4gc291cmNlRmlsZVxuICB9XG5cbiAgdHlwZSBSZXR1cm4gPSB7XG4gICAgY29tcGlsZXJIb3N0OiBDb21waWxlckhvc3RcbiAgICB1cGRhdGVGaWxlOiAoc291cmNlRmlsZTogU291cmNlRmlsZSkgPT4gYm9vbGVhblxuICB9XG5cbiAgY29uc3Qgdkhvc3Q6IFJldHVybiA9IHtcbiAgICBjb21waWxlckhvc3Q6IHtcbiAgICAgIC4uLnN5cyxcbiAgICAgIGdldENhbm9uaWNhbEZpbGVOYW1lOiBmaWxlTmFtZSA9PiBmaWxlTmFtZSxcbiAgICAgIGdldERlZmF1bHRMaWJGaWxlTmFtZTogKCkgPT4gJy8nICsgdHMuZ2V0RGVmYXVsdExpYkZpbGVOYW1lKGNvbXBpbGVyT3B0aW9ucyksIC8vICcvbGliLmQudHMnLFxuICAgICAgLy8gZ2V0RGVmYXVsdExpYkxvY2F0aW9uOiAoKSA9PiAnLycsXG4gICAgICBnZXREaXJlY3RvcmllczogKCkgPT4gW10sXG4gICAgICBnZXROZXdMaW5lOiAoKSA9PiBzeXMubmV3TGluZSxcbiAgICAgIGdldFNvdXJjZUZpbGU6IGZpbGVOYW1lID0+IHtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICBzb3VyY2VGaWxlcy5nZXQoZmlsZU5hbWUpIHx8XG4gICAgICAgICAgc2F2ZShcbiAgICAgICAgICAgIHRzLmNyZWF0ZVNvdXJjZUZpbGUoXG4gICAgICAgICAgICAgIGZpbGVOYW1lLFxuICAgICAgICAgICAgICBzeXMucmVhZEZpbGUoZmlsZU5hbWUpISxcbiAgICAgICAgICAgICAgY29tcGlsZXJPcHRpb25zLnRhcmdldCB8fCBkZWZhdWx0Q29tcGlsZXJPcHRpb25zKHRzKS50YXJnZXQhLFxuICAgICAgICAgICAgICBmYWxzZVxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgKVxuICAgICAgfSxcbiAgICAgIHVzZUNhc2VTZW5zaXRpdmVGaWxlTmFtZXM6ICgpID0+IHN5cy51c2VDYXNlU2Vuc2l0aXZlRmlsZU5hbWVzLFxuICAgIH0sXG4gICAgdXBkYXRlRmlsZTogc291cmNlRmlsZSA9PiB7XG4gICAgICBjb25zdCBhbHJlYWR5RXhpc3RzID0gc291cmNlRmlsZXMuaGFzKHNvdXJjZUZpbGUuZmlsZU5hbWUpXG4gICAgICBzeXMud3JpdGVGaWxlKHNvdXJjZUZpbGUuZmlsZU5hbWUsIHNvdXJjZUZpbGUudGV4dClcbiAgICAgIHNvdXJjZUZpbGVzLnNldChzb3VyY2VGaWxlLmZpbGVOYW1lLCBzb3VyY2VGaWxlKVxuICAgICAgcmV0dXJuIGFscmVhZHlFeGlzdHNcbiAgICB9LFxuICB9XG4gIHJldHVybiB2SG9zdFxufVxuXG4vKipcbiAqIENyZWF0ZXMgYW4gb2JqZWN0IHdoaWNoIGNhbiBob3N0IGEgbGFuZ3VhZ2Ugc2VydmljZSBhZ2FpbnN0IHRoZSB2aXJ0dWFsIGZpbGUtc3lzdGVtXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVWaXJ0dWFsTGFuZ3VhZ2VTZXJ2aWNlSG9zdChcbiAgc3lzOiBTeXN0ZW0sXG4gIHJvb3RGaWxlczogc3RyaW5nW10sXG4gIGNvbXBpbGVyT3B0aW9uczogQ29tcGlsZXJPcHRpb25zLFxuICB0czogVFNcbikge1xuICBjb25zdCBmaWxlTmFtZXMgPSBbLi4ucm9vdEZpbGVzXVxuICBjb25zdCB7IGNvbXBpbGVySG9zdCwgdXBkYXRlRmlsZSB9ID0gY3JlYXRlVmlydHVhbENvbXBpbGVySG9zdChzeXMsIGNvbXBpbGVyT3B0aW9ucywgdHMpXG4gIGNvbnN0IGZpbGVWZXJzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KClcbiAgbGV0IHByb2plY3RWZXJzaW9uID0gMFxuICBjb25zdCBsYW5ndWFnZVNlcnZpY2VIb3N0OiBMYW5ndWFnZVNlcnZpY2VIb3N0ID0ge1xuICAgIC4uLmNvbXBpbGVySG9zdCxcbiAgICBnZXRQcm9qZWN0VmVyc2lvbjogKCkgPT4gcHJvamVjdFZlcnNpb24udG9TdHJpbmcoKSxcbiAgICBnZXRDb21waWxhdGlvblNldHRpbmdzOiAoKSA9PiBjb21waWxlck9wdGlvbnMsXG4gICAgZ2V0U2NyaXB0RmlsZU5hbWVzOiAoKSA9PiBmaWxlTmFtZXMsXG4gICAgZ2V0U2NyaXB0U25hcHNob3Q6IGZpbGVOYW1lID0+IHtcbiAgICAgIGNvbnN0IGNvbnRlbnRzID0gc3lzLnJlYWRGaWxlKGZpbGVOYW1lKVxuICAgICAgaWYgKGNvbnRlbnRzKSB7XG4gICAgICAgIHJldHVybiB0cy5TY3JpcHRTbmFwc2hvdC5mcm9tU3RyaW5nKGNvbnRlbnRzKVxuICAgICAgfVxuICAgICAgcmV0dXJuXG4gICAgfSxcbiAgICBnZXRTY3JpcHRWZXJzaW9uOiBmaWxlTmFtZSA9PiB7XG4gICAgICByZXR1cm4gZmlsZVZlcnNpb25zLmdldChmaWxlTmFtZSkgfHwgJzAnXG4gICAgfSxcbiAgICB3cml0ZUZpbGU6IHN5cy53cml0ZUZpbGUsXG4gIH1cblxuICB0eXBlIFJldHVybiA9IHtcbiAgICBsYW5ndWFnZVNlcnZpY2VIb3N0OiBMYW5ndWFnZVNlcnZpY2VIb3N0XG4gICAgdXBkYXRlRmlsZTogKHNvdXJjZUZpbGU6IGltcG9ydCgndHlwZXNjcmlwdCcpLlNvdXJjZUZpbGUpID0+IHZvaWRcbiAgfVxuXG4gIGNvbnN0IGxzSG9zdDogUmV0dXJuID0ge1xuICAgIGxhbmd1YWdlU2VydmljZUhvc3QsXG4gICAgdXBkYXRlRmlsZTogc291cmNlRmlsZSA9PiB7XG4gICAgICBwcm9qZWN0VmVyc2lvbisrXG4gICAgICBmaWxlVmVyc2lvbnMuc2V0KHNvdXJjZUZpbGUuZmlsZU5hbWUsIHByb2plY3RWZXJzaW9uLnRvU3RyaW5nKCkpXG4gICAgICBpZiAoIWZpbGVOYW1lcy5pbmNsdWRlcyhzb3VyY2VGaWxlLmZpbGVOYW1lKSkge1xuICAgICAgICBmaWxlTmFtZXMucHVzaChzb3VyY2VGaWxlLmZpbGVOYW1lKVxuICAgICAgfVxuICAgICAgdXBkYXRlRmlsZShzb3VyY2VGaWxlKVxuICAgIH0sXG4gIH1cbiAgcmV0dXJuIGxzSG9zdFxufVxuIl19