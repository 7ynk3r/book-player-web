
// export default ({ book }) => {
//   return JSON.stringify(book);
// }

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useLiveQuery } from "dexie-react-hooks";
import _ from 'lodash';
import { Button } from '@mui/material';
import { IconButton } from '@mui/material';
import PlayIcon from '@mui/icons-material/PlayCircle';
import PauseIcon from '@mui/icons-material/PauseCircle';
import Replay30Icon from '@mui/icons-material/Replay30';
import Forward30Icon from '@mui/icons-material/Forward30';

import useAsyncEffect from './useAsyncEffect';
import db from './db';
import assert from './assert';
import { searchFilesAsync, getFileContentAsync, getFilePath, getFileName } from './files';

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

const AudioPlayer = ({ book, back }) => {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chapter, setChapter] = useState();
  const audioRef = useRef(null);

  useEffect(() => {
    if (playing) return;
    setChapter(book.nav.toc[0]);
  }, [book, playing]);

  useAsyncEffect(async () => {
    if (!chapter) return;
    const chapterAudioFile = (await searchFilesAsync(f => getFilePath(f) === chapter.filePath))[0];
    assert(chapterAudioFile, `chapterAudioFile not found for path "${chapter.filePath}"`);
    await getFileContentAsync(chapterAudioFile);
  }, [chapter])

  const audioUrl = useLiveQuery(async () => {
    if (!chapter) return;
    const file = await db.files
      .where('path')
      .equals(chapter.filePath)
      .first();
    const { data } = file;
    if (!data) return;
    return window.URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }));
  }, [chapter]);

  useEffect(() => {
    if (!audioUrl) return;
    console.log('Play', 'About to load file into player', { audioUrl });
    audioRef.current.src = audioUrl;
    audioRef.current.load();
  }, [audioUrl]);

  useEffect(() => {
    if (loading) return;
    if (playing) {
      audioRef.current.pause();
      audioRef.current.play();
    }
    else {
      audioRef.current.pause();
    }
  }, [loading, playing])


  const skip = (amount) => {
    audioRef.current.currentTime += amount;
  };

  return (
    <>
      {/* Back */}
      <a href="#" onClick={back}>Go to books</a>
      <br />

      {/* Audio */}
      <audio
        style={{ display: 'none' }}
        ref={audioRef}
        onLoadedData={() => {
          setLoading(false);
        }}
        onError={(e) => {
          console.error('Error loading audio:', e);
        }}
      />
      <br />

      {/* Controls */}
      <div style={{ textAlign: 'center' }}>
        <IconButton onClick={() => skip(-30)}>
          <Replay30Icon style={{ fontSize: 40 }} />
        </IconButton>
        <IconButton onClick={() => setPlaying(!playing)} >
          {playing ? <PauseIcon style={{ fontSize: 80 }} /> : <PlayIcon style={{ fontSize: 80 }} />}
        </IconButton>
        <IconButton onClick={() => skip(30)}>
          <Forward30Icon style={{ fontSize: 40 }} />
        </IconButton>
      </div>

      {/* Book Info */}
      <h2>Chapters</h2>
      <ul>
        {book.nav.toc.map((chapter, index) => (
          <li key={index}>
            <a href="#" onClick={() => setChapter(chapter)}>{chapter?.title}</a>
          </li>
        ))}
      </ul>
      <h2>Description</h2>
      <HtmlRenderer htmlContent={book.description.full} />
    </>
  );
};

export default AudioPlayer;
