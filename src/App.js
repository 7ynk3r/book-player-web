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
 * - logout in case of error
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
import LoginPage from './LoginPage';
import BooksPage from './BooksPage';
import PlayerPage from './PlayerPage';

import assert from './assert';
import db from './db';
import { init } from './files'

// db.calls.where('key').equals('storage')

// const get = ('storage', slowCall) => {
//   // const { lo } = db.calls.where('key').equals('storage').toArray();
//   setState({ loading: true })
//   slowCall().then(data => {
//     setState({ loading: false, data});
//   }).catch((error) => {
//     setState({loading: false, error});
//   });

// }

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

// Cache
const downloadCache = {};
const getCached = async (name, getData, metadata, options) => {
  if (!downloadCache[name]) {
    downloadCache[name] = await _getCached(name, getData, metadata, options);
    delete downloadCache[name]
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
      // NOTE: we need to clone for mobile safari to work
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

const getChapterFilePath = (selectedBook, selectedChapter) => {
  const { name: fileName, path: filePath } = getFileName(selectedChapter.path);
  const mp3FilePath = selectedBook.childrenPaths.filter(path => path.endsWith(fileName))[0];
  assert(mp3FilePath, `mp3 "${fileName}" in path "${filePath}" not found in [${selectedBook.childrenPaths}]`)
  return mp3FilePath;
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

// const getBooks = useCallback(() => {
//   assert(storage, 'storage needed');

// }, [storage]);

// const { loaindg, data, error } = getBooks();

function App() {
  // const [loading, setLoading] = useState(true);
  const [{ loading, storage, error, valid }, setStorageState] = useState({});
  // const [books, setBooks] = useState();
  const [selectedBook, setSelectedBook] = useState();
  const [selectedChapter, setSelectedChapter] = useState();
  const audioRef = useRef(null);


  const validateCredentials = useCallback(async (credsNew) => {
    const credsOld = JSON.parse(localStorage.getItem('creds'));
    if (credsOld && credsNew && credsNew.restore) {
      credsNew = credsOld;
    }
    console.info('zaraza', { credsNew });
    if (!credsNew) {
      console.info('logging out');
      if (credsOld) {
        localStorage.clear();
        await db.delete();
        console.info('cleared local storage');
        window.location.reload();
      }
      setStorageState({ loading: false, error: 'No creds' });
      return;
    };
    const { email, password } = credsNew;
    const storage = init(new Storage({
      userAgent: null,
      email,
      password
    }));
    setStorageState({ loading: true, storage, valid: credsNew === credsOld });
    let error = undefined;
    try {
      await storage.ready;
      localStorage.setItem('creds', JSON.stringify(credsNew));
    }
    catch (err) { error = err; }
    setStorageState({ loading: false, error, storage, valid: !error });
    return !error;
  }, [setStorageState]);

  // Search files 
  const searchFiles = useCallback(async (filter) => {
    assert(storage, 'storage is not defined');
    await storage.ready;
    return Object.values(storage.files).filter(filter);
  }, [storage]);

  useEffect(() => { validateCredentials({ restore: true }) }, []);

  // // Query chapters files (mp3)
  // const files = useLiveQuery(async () => {
  //   if (!selectedBook) return;
  //   // const { loading, error, lastUpdate } = db.collections.where('name').equals('files').toArray()[0] || {};
  //   // console.log('files', { bookId: getBookId(selectedBook), selectedBook })
  //   const files = await db.files
  //     .where('type')
  //     .equals()
  //     .toArray();
  //   return _.keyBy(files, 'shortName');
  // }, [selectedBook], {});


  console.log({ loading, storage, error, valid });


  switch (true) {
    case !!selectedBook:
      return (
        <div style={{ padding: '20px' }}>
          <PlayerPage book={selectedBook} back={() => setSelectedBook(undefined)} />
        </div>
      );
    case valid:
      return (
        <div style={{ padding: '20px' }}>
          <BooksPage logout={() => validateCredentials()} selectBook={setSelectedBook} />
        </div>
      );
    default:
      return (
        <div style={{ padding: '20px' }}>
          <LoginPage validateCredentials={validateCredentials} />
        </div>
      );
  }


  // // Query books
  // const books = useLiveQuery(async () => {
  //   return await db.books.toArray();
  // });

  // // Search files 
  // const searchFiles = useCallback((filter) =>
  //   storage ? Object.values(storage.files).filter(filter) : undefined,
  //   [storage]);

  // const validateCredentials = useCallback(async (creds) => {
  //   if (!creds) {
  //     localStorage.clear();
  //     await db.delete();
  //     window.location.reload();
  //   }
  //   const storage = await tryGetStorage(creds || {});
  //   localStorage.setItem('creds', JSON.stringify(creds || {}));
  //   setStorage(storage);
  //   setLoading(false)
  //   return !!storage;
  // }, [setLoading]);

  // const getNextChapter = useCallback(() => {
  //   const chapters = [...selectedBook.nav.toc].reverse();
  //   const { name } = getFileName(selectedChapter.path);
  //   console.log('getNextChapter', { chapters, selectedChapter })
  //   for (let i = 0; i < chapters.length; i++) {
  //     if (getFileName(chapters[i].path).name === name) {
  //       return chapters[i - 1];
  //     }
  //   }
  //   assert(false, 'The current chapter was not found');
  // }, [selectedBook, selectedChapter])

  // // Save config
  // const handleConfigChange = useCallback(() => {
  //   const { currentTime, playbackRate, volume } = audioRef.current;
  //   updateConfig({
  //     bookId: getBookId(selectedBook),
  //     chapterId: getChapterId(selectedChapter),
  //     currentTime,
  //     playbackRate,
  //     volume
  //   });
  // }, [audioRef, selectedBook, selectedChapter]);

  // // Try login
  // useAsyncEffect(async () => {
  //   const creds = JSON.parse(localStorage.getItem('creds'));
  //   validateCredentials(creds)
  // }, [validateCredentials]);

  // // Load books
  // useAsyncEffect(async () => {
  //   if (!storage) return;
  //   console.log("Storage updated", { files: Object.values(storage.files) });
  //   let bookFiles = searchFiles(file => file.name === 'openbook.json');

  //   const books = (await Promise.all(bookFiles.map(async file => {
  //     const data = await getFile(file);
  //     const book = JSON.parse(data);
  //     return {
  //       ...book,
  //       bookId: getBookId(book),
  //       path: getFilePath(file),
  //       childrenPaths: file.parent.children.map(getFilePath)
  //     };
  //   }))).sort((a, b) => a.title.main.localeCompare(b.title.main))
  //   // push books to the db
  //   await db.books.bulkPut(books);
  // }, [storage, searchFiles]);

  // // Resume book
  // useEffect(() => {
  //   if (!books || !shouldResumeLastSession) return;
  //   const { bookId } = getConfig();
  //   console.log('resume book', { bookId, books });
  //   const book = books.filter(it => getBookId(it) === bookId)[0];
  //   if (!book) return;
  //   setSelectedBook(book);
  // }, [books]);

  // // Select first chapter
  // useEffect(() => {
  //   if (!selectedBook) return;
  //   const chapters = getChapters(selectedBook);
  //   let chapter;
  //   if (shouldResumeLastSession) {
  //     // Resume chapter
  //     shouldResumeLastSession = false;
  //     const { chapterId, currentTime } = getConfig();
  //     chapter = chapters.filter(it => getChapterId(it) === chapterId)[0];
  //     console.log('resume chapter', { chapterId, currentTime, chapter, chapters });
  //     overrideCurrentTime = currentTime;
  //   }
  //   setSelectedChapter(chapter || chapters[0]);
  // }, [selectedBook]);

  // // Download selected chapter
  // useEffect(() => {
  //   selectedChapterRef.current = null;
  //   if (!selectedBook || !selectedChapter) return;
  //   downloadChapter(selectedBook, selectedChapter);
  // }, [selectedBook, selectedChapter]);

  // // Query chapters files (mp3)
  // const files = useLiveQuery(async () => {
  //   if (!selectedBook) return;
  //   const { loading, error, lastUpdate } = db.collections.where('name').equals('files').toArray()[0] || {};
  //   console.log('files', { bookId: getBookId(selectedBook), selectedBook })
  //   const files = await db.files
  //     .where('bookId')
  //     .equals(getBookId(selectedBook))
  //     .toArray();
  //   return _.keyBy(files, 'shortName');
  // }, [selectedBook], {});

  // // Selected chapter file
  // const selectedChapterFile = useLiveQuery(async () => {
  //   if (!selectedBook || !selectedChapter) return;
  //   const path = getChapterFilePath(selectedBook, selectedChapter)
  //   const file = await db.files
  //     .where('name')
  //     .equals(path)
  //     .toArray()[0];
  //   if (!file) {
  //     // Download file 
  //     getFile(searchFiles(f => getFilePath(f) === path)[0]);
  //   }
  //   return file;
  // }, [selectedBook, selectedChapter]);

  // // Play selected chapter
  // const selectedChapterRef = useRef(selectedChapter);
  // useEffect(() => {
  //   // if (!files || !selectedChapter) {
  //   //   console.log('Play', 'Ignored: no files nor chapter')
  //   //   return;
  //   // };
  //   if (!selectedChapterFile) return;
  //   const { name, startsAtSeconds } = getFileName(selectedChapter.path);
  //   const { data } = selectedChapterFile;
  //   if (!data) {
  //     console.log('Play', 'Pause: the chapter does not have the file yet')
  //     audioRef?.current?.pause();
  //     return;
  //   };
  //   if (selectedChapterRef.current === selectedChapter) {
  //     console.log('Play', 'Ignored: the chapter was the same as before')
  //     return
  //   };

  //   try {
  //     const url = window.URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }));
  //     console.log('Play', 'About to load file into player', { url });
  //     audioRef.current.src = url;
  //     audioRef.current.load();
  //   }
  //   catch {
  //     console.error(`Couldn't load audio file`, { audioRef, data, Buffer });
  //     return;
  //   }
  //   selectedChapterRef.current = selectedChapter;

  //   updateConfig({ currentTime: overrideCurrentTime || startsAtSeconds });
  //   overrideCurrentTime = null; // clear the override 

  //   // Load config
  //   const config = getConfig();
  //   if (config.playbackRate) audioRef.current.playbackRate = config.playbackRate;
  //   if (config.currentTime) audioRef.current.currentTime = config.currentTime;
  //   if (config.volume) audioRef.current.volume = config.volume;

  //   // Download next chapter 
  //   const nextChapter = getNextChapter();
  //   if (nextChapter) downloadChapter(selectedBook, getNextChapter());
  // }, [selectedChapterFile, selectedBook, selectedChapter, getNextChapter, audioRef])

  // // TODO: Make nicer
  // const [playbackRate, setPlaybackRate] = useState(initialConfig.playbackRate || 1);
  // const handlePlaybackRateChange = useCallback((event) => {
  //   if (!audioRef) return;
  //   const playbackRate = parseFloat(event.target.value);
  //   audioRef.current.playbackRate = playbackRate;
  //   updateConfig({ playbackRate });
  //   setPlaybackRate(playbackRate);
  // }, [setPlaybackRate]);

  // // useEffect(() => {
  // //   console.log('files', { files });
  // // }, [files])

  // switch (true) {
  //   case !!selectedBook:
  //     return (
  //       <div style={{ padding: '20px' }}>
  //         <a href="#" onClick={() => setSelectedBook(undefined)}>Go to books</a>
  //         <br />
  //         <h1>{selectedBook.title.main}</h1>
  //         <br />
  //         <div style={{ display: 'flex', alignItems: 'center' }}>
  //           <audio
  //             controls
  //             autoPlay
  //             ref={audioRef}
  //             onRateChange={handleConfigChange}
  //             onVolumeChange={handleConfigChange}
  //             onTimeUpdate={handleConfigChange}
  //             onEnded={() => setSelectedChapter(getNextChapter())}
  //             onError={(e) => {
  //               console.error('Error loading audio:', e);
  //             }}
  //           >
  //             Your browser does not support the audio element.
  //           </audio>
  //           <select
  //             id="playbackRate"
  //             value={playbackRate}
  //             onChange={handlePlaybackRateChange}
  //             style={{ marginLeft: 10 }}
  //           >
  //             <option value={0.5}>0.5x</option>
  //             <option value={0.75}>0.75x</option>
  //             <option value={0.9}>0.9x</option>
  //             <option value={1}>1x</option>
  //             <option value={1.1}>1.1x</option>
  //             <option value={1.25}>1.25x</option>
  //             <option value={1.5}>1.5x</option>
  //             <option value={1.75}>1.75x</option>
  //             <option value={2}>2x</option>
  //           </select>
  //         </div>
  //         <br />
  //         <h2>Chapters</h2>
  //         <ul>
  //           {selectedBook.nav.toc.map((chapter, index) => (
  //             <li key={index}>
  //               <a href="#"
  //                 style={{
  //                   fontWeight: chapter === selectedChapter ? 'bold' : 'normal',
  //                 }}
  //                 onClick={() => setSelectedChapter(chapter)}>
  //                 {chapter.title + ' ' + statusToIcon[((files || {})[getFileName(chapter.path).name]?.status || '')]}
  //               </a>
  //             </li>
  //           ))}
  //         </ul>
  //         <h2>Description</h2>
  //         <HtmlRenderer htmlContent={selectedBook.description.full} />
  //       </div>
  //     );
  //   case !!books:
  //     return (
  //       <div style={{ padding: '20px' }}>
  //         <a href="#" onClick={() => validateCredentials()}>Logout</a>
  //         <br />
  //         <h1>Books</h1>
  //         <ul>
  //           {books.map((book, index) => (
  //             <li key={index}>
  //               <a href="#" onClick={() => setSelectedBook(book)}>{book.title.main}</a>
  //             </li>
  //           ))}
  //         </ul>
  //       </div>
  //     );
  //   case loading:
  //     return (<LoadingSpinner />);
  //   case !storage:
  //     return (
  //       <div style={{ padding: '20px' }}>
  //         <LoginForm validateCredentials={validateCredentials} />
  //       </div>
  //     );
  //   default:
  //     // validateCredentials();
  //     return undefined;
  // }

}

export default App;
