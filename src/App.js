/**
 * TODO
 * - avoid initial re-load
 * - continue playing next chapter
 * - load cover
 */

import React, { useState, useEffect, useRef } from 'react';
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

// Useful func
const getFileName = (file) => {
  let name = ''
  while (file) {
    name = '/' + file.name + name
    file = file.parent
  }
  return name
}

// const getFiles = async (options = {}) => {
//   const name = '__files__'
//   await storage.ready
//   data = await db.files.where('name').equals(name).first()

//   return Object.values(storage.files)
// };

const getCached = async (name, getData, options = {}) => {
  const { noCache, useLocalStorage } = options;
  // const name = getFileName(file)
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

const getFile = async (file, options = {}) => {
  return getCached(getFileName(file), () => file.downloadBuffer(), options);
}

const CONFIG_KEY = "config";
const setConfig = (config) => localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
const getConfig = () => JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
const updateConfig = (partial) => setConfig({ ...getConfig(CONFIG_KEY), ...partial });

function App() {
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState();
  const [selectedChapter, setSelectedChapter] = useState();

  // Load books
  useEffect(() => {
    const load = async () => {
      await storage.ready
      let bookFiles = Object.values(storage.files).filter(file => file.name === 'openbook.json')
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

  // Selected book
  useEffect(() => {
    if (!selectedBook) {
      setSelectedChapter(undefined);
    }
  }, [selectedBook]);


  // Selected chapter
  useEffect(() => {
    if (!selectedChapter) return;
    playMedia(selectedChapter)
  }, [selectedChapter]);

  const playMedia = async (chapter) => {
    // const mp3Path = book.nav.toc[0].path;
    const mp3Path = chapter.path;
    const mp3Parts = mp3Path.split('-')
    const mp3FileName = mp3Parts[mp3Parts.length - 1]
    const files = selectedBook.file.parent.children;
    const mp3File = files.filter(file => file.name.endsWith(mp3FileName))[0];
    if (!mp3File) {
      throw new Error(`mp3 part "${mp3FileName}" in path "${mp3Path}" not found in [${files.map(it => it.name)}]`);
    }
    const data = await getFile(mp3File);
    const url = window.URL.createObjectURL(new Blob([data]));

    audioRef.current.src = url
    audioRef.current.load();
    // Load config
    const config = getConfig();
    if (config.playbackRate) audioRef.current.playbackRate = config.playbackRate;
    if (config.currentTime) audioRef.current.currentTime = config.currentTime;
    if (config.volume) audioRef.current.volume = config.volume;
    // Start
    audioRef.current.play();
  };

  const audioRef = useRef(null);

  // Save config
  const handleConfigChange = () => {
    const { currentTime, playbackRate, volume } = audioRef.current;
    updateConfig({ currentTime, playbackRate, volume });
  };

  console.log({ audioRef, books, selectedBook });

  return (
    <div>
      {!selectedBook ? (
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
      ) : (
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
          >
            Your browser does not support the audio element.
          </audio>
          <br />
          <br />
          <ul>
            {selectedBook.nav.toc.map((chapter, index) => (
              <li key={index}>
                <a href="#" onClick={() => setSelectedChapter(chapter)}>{chapter.title}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
