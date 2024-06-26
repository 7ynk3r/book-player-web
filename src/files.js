import assert from './assert';
import db from './db';

let _storage = undefined;

export const init = (s) => {
  _storage = s;
  return s;
}

export const searchFilesAsync = async (filter) => {
  assert(_storage, '_storage is not defined');
  await _storage.ready;
  // console.log('files', { files: Object.values(_storage.files), paths: Object.values(_storage.files).map(getFilePath) });
  return Object.values(_storage.files).filter(filter);
};

export const getFilePath = (file) => {
  let name = '';
  while (file) {
    name = '/' + file.name + name;
    file = file.parent;
  }
  return name;
}

export const getFileName = (file) => file.name;
export const getFileType = (file) => file.name.split('.').slice(-1)[0];

// "path": "{C27AB72C-AA23-4324-9BDC-65BEBAB5FEA5}Fmt425-Part01.mp3#4242"
export const getFileShortName = (path) => path.split('-').slice(-1)[0].split('#')[0];
export const getFileOffset = (path) => parseInt(path.split('#')[1]) || 0;

const clone = x => new Uint8Array(x); // clone by default
export const getFileContentAsync = async (file, format = clone) => {
  const [name, path, type] = [getFileName(file), getFilePath(file), getFileType(file)];
  // return if exists
  const row = await db.files.where('path').equals(path).first();
  if (row) return;

  // otherwise fetch
  await db.files.put({ path, name, type, loading: true });
  let [data, error] = [undefined, undefined];
  try {
    file.api.userAgent = null
    // console.log('file.api.userAgent', file);
    data = await file.downloadBuffer();
    console.log({ format, data });
    data = format(data);
  }
  catch (e) { error = e; }
  console.log('getFileContentAsync', { path, name, type, loading: false, data, error })
  await db.files.put({ path, name, type, loading: false, data, error });
}

export const updateFileContentAsync = async (path, data) => {
  const row = await db.files.where('path').equals(path).first();
  assert(row, `row is not found for path "${path}"`);
  await db.files.put({ ...row, data });
}
