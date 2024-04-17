/**
 * TODO
 * - safari mobile not working. print the last and first 10 elements
 * - load the schemas automatically, then the storage.await
 * - give the impression of a single audio file
 * - update current chapter when the chapter is in the same file
 * - load cover
 * - avoid initial re-load of the file tree: we cannot serialize the files...
 * - break in components
 * - recreate the db on logout. clear db and everything, and call url reload ;)
 */

/* eslint-disable jsx-a11y/anchor-is-valid */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Storage } from 'megajs'
import Dexie from 'dexie';
import { useLiveQuery } from "dexie-react-hooks";
import _ from 'lodash';
import { Buffer } from 'buffer';

import useAsyncEffect from './useAsyncEffect'
import LoadingSpinner from './LoadingSpinner';
import LoginForm from './LoginForm';

// Define the database schema
const db = new Dexie('AudioDB');

db.version(1).stores({
  files: 'name, bookId',
});

// HtmlRenderer
const HtmlRenderer = ({ htmlContent }) => {
  return (
    <div
      dangerouslySetInnerHTML={{
        __html: htmlContent,
      }}
    />
  );
};

// Assert
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Cache
const downloadCache = {};
const getCached = async (name, getData, metadata, options) => {
  if (!downloadCache[name]) {
    downloadCache[name] = _getCached(name, getData, metadata, options);
  }
  return downloadCache[name];
}
const _getCached = async (name, getData, metadata = {}, { noCache, onlyCache } = {}) => {
  // const { noCache, useLocalStorage } = { noCache: true };
  assert(name, '"name" should be defined');
  assert(getData, '"getData" should be defined');
  let data = null
  if (!noCache) {
    data = await db.files.where('name').equals(name).first();
    data = data?.data;
  }
  if (data || onlyCache) {
    console.log(`File "${name}" ${data ? 'found' : 'not found'} locally`);
    return data;
  }
  else {
    console.info(`File "${name}" not found locally`);
  }
  if (!noCache) {
    await db.files.put({ ...metadata, name, status: 'loading' });
  }
  let error = null;
  try {
    data = await getData();
    console.info(`File "${name}" downloaded locally`);
    if (name.endsWith('.json')) {
      data = data.toString();
    }
  }
  catch (ex) {
    console.info(`File "${name}" failed to be downloaded`, ex);
    error = ex;
  }
  if (!noCache) {
    await db.files.put({ ...metadata, name, data, status: error ? 'error' : 'ok' });
  }
  return data;
}

const getFileName = (path) => {
  const parts = path.split('?')[0].split('-')
  const mp3FileNameWithSeconds = parts[parts.length - 1];
  const [name, seconds = '0'] = mp3FileNameWithSeconds.split('#')
  return { name, path, startsAtSeconds: parseInt(seconds) }
}

const getFilePath = (file) => {
  let name = ''
  while (file) {
    name = '/' + file.name + name
    file = file.parent
  }
  return name
}

const getFile = async (file, metadata, options) => {
  const path = getFilePath(file);
  return getCached(path, async () => {
    file.api.userAgent = null;
    const data = await file.downloadBuffer();
    if (path.endsWith('.mp3')) {
      // return new Blob([data], { type: 'audio/mpeg' });
      return new Uint8Array(data);
    }
    return data;
  }, metadata, options);
}

const downloadChapter = async (selectedBook, chapter) => {
  console.log('downloadChapter', { chapter, selectedBook });
  assert(chapter, '"chapter" must be defined');
  assert(selectedBook, '"selectedBook" must be defined');

  const { name: fileName, path: filePath, startsAtSeconds } = getFileName(chapter.path);
  const files = selectedBook.file.parent.children;
  const mp3File = files.filter(file => file.name.endsWith(fileName))[0];
  assert(mp3File, `mp3 part "${fileName}" in path "${filePath}" not found in [${files.map(it => it.name)}]`)

  const data = await getFile(mp3File, {
    bookId: getBookId(selectedBook),
    shortName: getFileName(mp3File.name).name
    // chapterId: getChapterId(chapter) // a file can belong to many chapters
  });
  return { data, name: fileName, path: filePath, startsAtSeconds };
}

const getBookId = (book) => book['-odread-buid'];
const getChapters = (book) => book?.nav?.toc || [];
const getChapterId = (chapter) => chapter?.path;

const CONFIG_KEY = "config";
const setConfig = (config) => localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
const getConfig = () => JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
const updateConfig = (partial) => setConfig({ ...getConfig(CONFIG_KEY), ...partial });

const tryGetStorage = async ({ email, password }) => {
  const storage = new Storage({
    userAgent: null,
    email,
    password
  });
  try {
    await storage.ready;
    return storage;
  }
  catch {
    return undefined
  }
};

const statusToIcon = {
  'loading': '🔄',
  'ok': '✅',
  'error': '❗',
  '': ''
}

// NOTE: we can move this into `state` 
let overrideCurrentTime = null;
let shouldResumeLastSession = true;

const initialConfig = getConfig();

// Components ////////////////////////////////////

// const Chapters = (book) => {

// };

// const Books = (books) => {

// }

function App() {
  const [loading, setLoading] = useState(true);
  const [storage, setStorage] = useState();
  const [books, setBooks] = useState();
  const [selectedBook, setSelectedBook] = useState();
  const [selectedChapter, setSelectedChapter] = useState();
  const audioRef = useRef(null);

  const validateCredentials = useCallback(async (creds) => {
    if (!creds) {
      localStorage.clear();
      await db.delete();
      window.location.reload();
    }
    const storage = await tryGetStorage(creds || {});
    localStorage.setItem('creds', JSON.stringify(creds || {}));
    setStorage(storage);
    setLoading(false)
    return !!storage;
  }, [setLoading]);

  const getNextChapter = useCallback(() => {
    const chapters = [...selectedBook.nav.toc].reverse();
    const { name } = getFileName(selectedChapter.path);
    console.log('getNextChapter', { chapters, selectedChapter })
    for (let i = 0; i < chapters.length; i++) {
      if (getFileName(chapters[i].path).name === name) {
        return chapters[i - 1];
      }
    }
    assert(false, 'The current chapter was not found');
  }, [selectedBook, selectedChapter])

  // Save config
  const handleConfigChange = useCallback(() => {
    const { currentTime, playbackRate, volume } = audioRef.current;
    updateConfig({
      bookId: getBookId(selectedBook),
      chapterId: getChapterId(selectedChapter),
      currentTime,
      playbackRate,
      volume
    });
  }, [audioRef, selectedBook, selectedChapter]);

  // Try login
  useAsyncEffect(async () => {
    const creds = JSON.parse(localStorage.getItem('creds'));
    validateCredentials(creds)
  }, [validateCredentials]);

  // Load books
  useAsyncEffect(async () => {
    if (!storage) return;
    // await storage.ready
    const files = Object.values(storage.files);
    console.log({ files, File })
    let bookFiles = files.filter(file => file.name === 'openbook.json')

    const books = (await Promise.all(bookFiles.map(async file => {
      const data = await getFile(file);
      const book = JSON.parse(data);
      return { ...book, file }
    }))).sort((a, b) => a.title.main.localeCompare(b.title.main))

    setBooks(books);
  }, [storage]);

  // Resume book
  useEffect(() => {
    if (!books || !shouldResumeLastSession) return;
    const { bookId } = getConfig();
    console.log('resume book', { bookId, books });
    const book = books.filter(it => getBookId(it) === bookId)[0];
    if (!book) return;
    setSelectedBook(book);
  }, [books]);

  // Select first chapter
  useEffect(() => {
    if (!selectedBook) return;
    const chapters = getChapters(selectedBook);
    let chapter;
    if (shouldResumeLastSession) {
      // Resume chapter
      shouldResumeLastSession = false;
      const { chapterId, currentTime } = getConfig();
      chapter = chapters.filter(it => getChapterId(it) === chapterId)[0];
      console.log('resume chapter', { chapterId, currentTime, chapter, chapters });
      overrideCurrentTime = currentTime;
    }
    setSelectedChapter(chapter || chapters[0]);
  }, [selectedBook]);

  // Download selected chapter
  useEffect(() => {
    selectedChapterRef.current = null;
    if (!selectedBook || !selectedChapter) return;
    downloadChapter(selectedBook, selectedChapter);
  }, [selectedBook, selectedChapter]);

  // Query chapters files (mp3)
  const files = useLiveQuery(async () => {
    if (!selectedBook) return;
    console.log('files', { bookId: getBookId(selectedBook), selectedBook })
    const files = await db.files
      .where('bookId')
      .equals(getBookId(selectedBook))
      .toArray();
    return _.keyBy(files, 'shortName');
  }, [selectedBook], {});

  // Play selected chapter
  const selectedChapterRef = useRef(selectedChapter);
  useEffect(() => {
    if (!files || !selectedChapter) {
      console.log('Play', 'Ignored: no files nor chapter')
      return;
    };
    const { name, startsAtSeconds } = getFileName(selectedChapter.path);
    const { data } = files[name] || {};
    if (!data) {
      console.log('Play', 'Pause: the chapter does not have the file yet')
      audioRef?.current?.pause();
      return;
    };
    if (selectedChapterRef.current === selectedChapter) {
      console.log('Play', 'Ignored: the chapter was the same as before')
      return
    };

    try {
      // const url = window.URL.createObjectURL(data)
      const url = window.URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }));
      console.log('Play', 'About to load file into player', { url });
      audioRef.current.src = url;
      audioRef.current.load();
    }
    catch {
      console.error(`Couldn't load audio file`, { audioRef, data, Buffer });
      return;
    }
    selectedChapterRef.current = selectedChapter;

    updateConfig({ currentTime: overrideCurrentTime || startsAtSeconds });
    overrideCurrentTime = null; // clear the override 

    // Load config
    const config = getConfig();
    if (config.playbackRate) audioRef.current.playbackRate = config.playbackRate;
    if (config.currentTime) audioRef.current.currentTime = config.currentTime;
    if (config.volume) audioRef.current.volume = config.volume;

    // Download next chapter 
    const nextChapter = getNextChapter();
    if (nextChapter) downloadChapter(selectedBook, getNextChapter());
  }, [files, selectedBook, selectedChapter, getNextChapter, audioRef])

  // TODO: Make nicer
  const [playbackRate, setPlaybackRate] = useState(initialConfig.playbackRate || 1);
  const handlePlaybackRateChange = useCallback((event) => {
    if (!audioRef) return;
    const playbackRate = parseFloat(event.target.value);
    audioRef.current.playbackRate = playbackRate;
    updateConfig({ playbackRate });
    setPlaybackRate(playbackRate);
  }, [setPlaybackRate]);

  useEffect(() => {
    console.log('files', { files });
  }, [files])

  switch (true) {
    case loading:
      return (<LoadingSpinner />);
    case !storage:
      return (
        <div style={{ padding: '20px' }}>
          <LoginForm validateCredentials={validateCredentials} />
        </div>
      );
    case !!selectedBook:
      return (
        <div style={{ padding: '20px' }}>
          <a href="#" onClick={() => setSelectedBook(undefined)}>Go to books</a>
          <br />
          <h1>{selectedBook.title.main}</h1>
          <br />
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <audio
              controls
              autoPlay
              ref={audioRef}
              onRateChange={handleConfigChange}
              onVolumeChange={handleConfigChange}
              onTimeUpdate={handleConfigChange}
              onEnded={() => setSelectedChapter(getNextChapter())}
              onError={(e) => {
                console.error('Error loading audio:', e);
              }}
            >
              Your browser does not support the audio element.
            </audio>
            <select
              id="playbackRate"
              value={playbackRate}
              onChange={handlePlaybackRateChange}
              style={{ marginLeft: 10 }}
            >
              <option value={0.5}>0.5x</option>
              <option value={0.75}>0.75x</option>
              <option value={0.9}>0.9x</option>
              <option value={1}>1x</option>
              <option value={1.1}>1.1x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
              <option value={1.75}>1.75x</option>
              <option value={2}>2x</option>
            </select>
          </div>
          <br />
          <h2>Chapters</h2>
          <ul>
            {selectedBook.nav.toc.map((chapter, index) => (
              <li key={index}>
                <a href="#"
                  style={{
                    fontWeight: chapter === selectedChapter ? 'bold' : 'normal',
                  }}
                  onClick={() => setSelectedChapter(chapter)}>
                  {chapter.title + ' ' + statusToIcon[((files || {})[getFileName(chapter.path).name]?.status || '')]}
                </a>
              </li>
            ))}
          </ul>
          <h2>Description</h2>
          <HtmlRenderer htmlContent={selectedBook.description.full} />
        </div>
      );
    case !!books:
      return (
        <div style={{ padding: '20px' }}>
          <a href="#" onClick={() => validateCredentials()}>Logout</a>
          <br />
          <h1>Books</h1>
          <ul>
            {books.map((book, index) => (
              <li key={index}>
                <a href="#" onClick={() => setSelectedBook(book)}>{book.title.main}</a>
              </li>
            ))}
          </ul>
        </div>
      );
    default:
      return undefined;
  }

}

export default App;
