/**
 * TODO
 * - preload following chapters 
 * - give the impression of a single audio file
 * - resume playing 
 * - show current chapter 
 * - show book description and subtitle 
 * - load cover
 * - avoid initial re-load of the file tree: we cannot serialize the files...
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Storage } from 'megajs'
import Dexie from 'dexie';

// Define the MEGA storage
const storage = new Storage({
  email: 'elmaildejuan2@gmail.com',
  password: 'uKv94CV2.zK4tY6',
  userAgent: 'BookPlayerApplication/1.0'
})

// Define the database schema
const db = new Dexie('AudioDB');

db.version(1).stores({
  files: '++id, &name',
});

// Cache
const getCached = async (name, getData, options = {}) => {
  const { noCache, useLocalStorage } = options;
  // const { noCache, useLocalStorage } = { noCache: true };
  let data = null
  if (!noCache) {
    if (useLocalStorage) {
      data = localStorage.getItem(name)
    }
    else {
      data = await db.files.where('name').equals(name).first()
      data = data?.data
    }
  }
  if (data) {
    console.log(`File "${name}" found locally`)
    return data;
  }
  else {
    console.info(`File "${name}" not found locally`)
  }
  // data = await file.downloadBuffer()
  data = await getData();
  console.info(`File "${name}" downloaded locally`)
  if (name.endsWith('.json')) {
    data = data.toString()
  }
  if (!noCache) {
    if (useLocalStorage) {
      localStorage.setItem(name, data.toString());
    }
    else {
      await db.files.add({ name, data })
    }
  }
  return data
}

const getFiles = async (options = {}) => {
  return getCached('__files__', async () => {
    await storage.ready;
    return db.files.where('name');

  }, options);
};

// Useful func
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

const getFile = async (file, options = {}) => {
  return getCached(getFilePath(file), () => file.downloadBuffer(), options);
}

const getBookId = (book) => book['-odread-buid'];
const getChapters = (book) => book?.nav?.toc || [];
const getChapterId = (chapter) => chapter?.path;

const CONFIG_KEY = "config";
const setConfig = (config) => localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
const getConfig = () => JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
const updateConfig = (partial) => setConfig({ ...getConfig(CONFIG_KEY), ...partial });

let overrideCurrentTime = null;

// App ////////////////////////////////////
function App() {
  const [ready, setReady] = useState(false);
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState();
  const [selectedChapter, setSelectedChapter] = useState();
  // const [currentTime, setCurrentTime] = useState();
  const audioRef = useRef(null);

  // Load books
  useEffect(() => {
    const load = async () => {
      await storage.ready
      const files = Object.values(storage.files);
      console.log({ files, File })
      let bookFiles = files.filter(file => file.name === 'openbook.json')

      // TODO: Revert 
      bookFiles = [bookFiles[0]]
      const books = (await Promise.all(bookFiles.map(async file => {
        const data = await getFile(file)
        const book = JSON.parse(data);
        return { ...book, file }
      }))).sort((a, b) => a.title.main.localeCompare(b.title.main))

      setBooks(books);
    }
    load();
  }, []);

  // Resume book
  useEffect(() => {
    if (!ready) return;
    const { bookId, chapterId, currentTime } = getConfig();
    console.log('resume', { bookId, chapterId, currentTime });
    const book = books.filter(it => getBookId(it) === bookId)[0];
    if (!book) return;
    setSelectedBook(book)
    const chapters = getChapters(book);
    const chapter = chapters.filter(it => getChapterId(it) === chapterId)[0]
    if (!chapter) return;
    overrideCurrentTime = currentTime;
    setSelectedChapter(chapter);
  }, [books, ready]);

  // Selected book
  useEffect(() => {
    if (!selectedBook) {
      setSelectedChapter(undefined);
    }
    console.log('selectedBook', { selectedBook })
    // if (selectedBook) {
    //   // console.log('selectedBook', selectedBook.spine.map(it => it.path))
    //   console.log('selectedBook', selectedBook.spine.map(it => ({ file: getFileName(it.path), duration: it['audio-duration'] })))
    // }
  }, [selectedBook]);

  // Selected chapter
  useEffect(() => {
    if (!selectedChapter) return;
    playMedia(selectedChapter)
  }, [selectedChapter]);

  const getNextChapter = useCallback(() => {
    const chapters = [...selectedBook.nav.toc].reverse();
    console.log('getNextChapter', { chapters, selectedChapter })
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].path === selectedChapter.path) {
        return chapters[i - 1];
      }
    }
    throw new Error('The current chapter was not found');
  }, [selectedBook, selectedChapter])

  const downloadChapter = useCallback(async (chapter) => {
    console.log('downloadChapter', { chapter, selectedBook });
    const { name: fileName, path: filePath, startsAtSeconds } = getFileName(chapter.path);
    const files = selectedBook.file.parent.children;
    const mp3File = files.filter(file => file.name.endsWith(fileName))[0];
    if (!mp3File) {
      throw new Error(`mp3 part "${fileName}" in path "${filePath}" not found in [${files.map(it => it.name)}]`);
    }
    const data = await getFile(mp3File);
    return { data, name: fileName, path: filePath, startsAtSeconds }
  }, [selectedBook]);

  const playMedia = useCallback(async (chapter) => {
    console.log('playMedia', { chapter });
    audioRef.current.pause();

    const { data, startsAtSeconds } = await downloadChapter(chapter);
    const url = window.URL.createObjectURL(new Blob([data]));
    updateConfig({ currentTime: overrideCurrentTime || startsAtSeconds });
    overrideCurrentTime = null; // clear the override 

    audioRef.current.src = url
    audioRef.current.load();

    // Load config
    const config = getConfig();
    if (config.playbackRate) audioRef.current.playbackRate = config.playbackRate;
    if (config.currentTime) audioRef.current.currentTime = config.currentTime;
    if (config.volume) audioRef.current.volume = config.volume;

    // Start
    audioRef.current.play();

    // Download next chapter 
    downloadChapter(getNextChapter());
  }, [audioRef, downloadChapter, getNextChapter]);

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

  console.log({ audioRef, books, selectedBook });

  switch (true) {
    case !ready:
      return (
        <div>
          <h1>Welcome!</h1>
          <button onClick={() => setReady(true)}>Start</button>
        </div>
      );
    case !selectedBook:
      return (
        <div>
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
    case !!selectedBook:
      return (
        <div>
          <h1>{selectedBook.title.main}</h1>
          <button onClick={() => setSelectedBook(undefined)}>Go back</button>
          <br />
          <br />
          <audio
            controls
            autoPlay
            ref={audioRef}
            onRateChange={handleConfigChange}
            onVolumeChange={handleConfigChange}
            onTimeUpdate={handleConfigChange}
            onEnded={() => setSelectedChapter(getNextChapter())}
          >
            Your browser does not support the audio element.
          </audio>
          <br />
          <br />
          <ul>
            {selectedBook.nav.toc.map((chapter, index) => (
              <li key={index}>
                <a href="#"
                  style={{
                    fontWeight: chapter === selectedChapter ? 'bold' : 'normal',
                  }}
                  onClick={() => setSelectedChapter(chapter)}>
                  {chapter.title}
                </a>
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
