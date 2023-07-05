"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const default_1 = __importDefault(require("@nx/workspace/tasks-runners/default"));
const storage_1 = require("@google-cloud/storage");
const path_1 = require("path");
const fs_1 = require("fs");
const mkdirp_1 = __importDefault(require("mkdirp"));
function runner(tasks, options, context) {
    if (!options.bucket) {
        throw new Error('missing bucket property in runner options. Please update nx.json');
    }
    const bucket = new storage_1.Storage().bucket(options.bucket);
    return default_1.default(tasks, { ...options, remoteCache: { retrieve, store } }, context);
    async function retrieve(hash, cacheDirectory) {
        try {
            const commitFile = bucket.file(`${hash}.commit`);
            if (!(await commitFile.exists())[0]) {
                return false;
            }
            const [files] = await bucket.getFiles({ prefix: `${hash}/` });
            await Promise.all(files.map(download));
            await download(commitFile); // commit file after we're sure all content is downloaded
            console.log(`retrieved ${files.length + 1} files from cache gs://${bucket.name}/${hash}`);
            return true;
        }
        catch (e) {
            console.log(e);
            console.log(`WARNING: failed to download cache from ${bucket.name}: ${e.message}`);
            return false;
        }
        async function download(file) {
            const destination = path_1.join(cacheDirectory, file.name);
            await mkdirp_1.default(path_1.dirname(destination));
            await file.download({ destination });
        }
    }
    async function store(hash, cacheDirectory) {
        const tasks = [];
        try {
            await uploadDirectory(path_1.join(cacheDirectory, hash));
            await Promise.all(tasks);
            await bucket.upload(path_1.join(cacheDirectory, `${hash}.commit`)); // commit file once we're sure all content is uploaded
            console.log(`stored ${tasks.length + 1} files in cache gs://${bucket.name}/${hash}`);
            return true;
        }
        catch (e) {
            console.log(`WARNING: failed to upload cache to ${bucket.name}: ${e.message}`);
            return false;
        }
        async function uploadDirectory(dir) {
            for (const entry of await fs_1.promises.readdir(dir)) {
                const full = path_1.join(dir, entry);
                const stats = await fs_1.promises.stat(full);
                if (stats.isDirectory()) {
                    await uploadDirectory(full);
                }
                else if (stats.isFile()) {
                    const destination = path_1.relative(cacheDirectory, full);
                    tasks.push(bucket.upload(full, { destination }));
                }
            }
        }
    }
}
exports.default = runner;
