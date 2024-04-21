
// export default ({ book }) => {
//   return JSON.stringify(book);
// }

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useLiveQuery } from "dexie-react-hooks";
import { Howl, Howler } from 'howler';
import _ from 'lodash';

import useAsyncEffect from './useAsyncEffect';
import db from './db';
import assert from './assert';
import { searchFilesAsync, getFileContentAsync, getFilePath, getFileName } from './files';

// "path": "{C27AB72C-AA23-4324-9BDC-65BEBAB5FEA5}Fmt425-Part01.mp3#4242"
const getChapterAudioFileName = (path) => path.split('-').slice(-1);
const getChapterAudioFileSecondsOffset = (path) => path.split('#').slice(-1);

// const getChapterAudioFileContentAsync = async (book, chapter) => {
//   assert(book, 'book is not defined')
//   assert(chapter, 'chapter is not defined')
//   const chapterAudioFilePath = chapter.path;
//   const chapterAudioFileName = getChapterAudioFileName(chapterAudioFilePath);
//   // getChapterAudioFileSecondsOffset
//   const bookFile = (await searchFilesAsync(it => getFilePath(it) === book.path))[0];
//   console.log({ bookFile });
//   const bookChildrenFiles = bookFile.parent.children;
//   const chapterAudioFile = bookChildrenFiles.filter(file => file.name.endsWith(chapterAudioFileName))[0];
//   assert(chapterAudioFile, `mp3 part "${chapterAudioFileName}" in path "${chapterAudioFilePath}" not found in [${bookChildrenFiles.map(it => it.name)}]`)

//   book1 = { ...book, }
//   return getFilePath(chapterAudioFile);
//   console.log('loading audio file', { chapterAudioFile });
//   await getFileContentAsync(chapterAudioFile);
// }

// const setChaptersAudioFilePathAsync = async (book) => {
//   const bookFile = (await searchFilesAsync(it => getFilePath(it) === book.path))[0];
//   const bookChildrenFiles = bookFile.parent.children;
//   const bookChildrenFilePaths = _.fromPairs(bookChildrenFiles.map(it => [getChapterAudioFileName(getFileName(it)), getFilePath(it)]));
//   console.log('setChaptersAudioFilePathAsync', { bookChildrenFilePaths })
//   const toc0 = book.nav.toc.map(t => ({...t, bookChildrenFilePaths[t.path] }))
//   const book0 = { ...book, nav: {...book.nav, toc} }
//   // const chapters = book.nav.toc;
// }

const AudioPlayer = ({ book, back }) => {
  const [playing, setPlaying] = useState(false);
  const [chapter, setChapter] = useState();
  const audioRef = useRef(null);

  useEffect(() => {
    if (!playing) return;
    setChapter(book.nav.toc[0]);
  }, [book, playing]);

  useAsyncEffect(async () => {
    if (!chapter) return;
    const chapterAudioFile = (await searchFilesAsync(f => getFilePath(f) === chapter.filePath))[0];
    assert(chapterAudioFile, `chapterAudioFile not found for path "${chapter.filePath}"`);
    await getFileContentAsync(chapterAudioFile);
  }, [chapter])

  // Query books from files
  const audioUrl = useLiveQuery(async () => {
    if (!chapter) return;
    const { data } = await db.files
      .where('path')
      .equals(chapter.filePath)
      .first();
    // console.log({ audioFile })
    // const books = bookFiles.map(({ data }) => JSON.parse(decoder.decode(data)));
    const url = window.URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }));
    console.log('url', { url })
    return url;
  }, [chapter], []);

  useEffect(() => {
    if (!audioUrl) return;
    console.log('Play', 'About to load file into player', { audioUrl });
    audioRef.current.src = audioUrl;
    audioRef.current.load();

  }, [audioUrl]);


  return (
    <>
      <a href="#" onClick={back}>Go to books</a>
      <br />
      <div>
        <button onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
        <audio
          controls
          autoPlay
          ref={audioRef}
          onError={(e) => {
            console.error('Error loading audio:', e);
          }}
        >
          Your browser does not support the audio element.
        </audio>
      </div>
    </>
  );

  // const sound = new Howl({
  //   src: ['audio.mp3'],
  //   autoplay: false,
  //   loop: false,
  //   volume: 0.5,
  //   onplay: () => {
  //     setPlaying(true);
  //   },
  //   onend: () => {
  //     setPlaying(false);
  //   },
  // });

  // const togglePlay = () => {
  //   if (playing) {
  //     sound.pause();
  //   } else {
  //     sound.play();
  //   }
  // };

  // return (
  //   <div>
  //     <button onClick={togglePlay}>{playing ? 'Pause' : 'Play'}</button>
  //   </div>
  // );
};

export default AudioPlayer;
