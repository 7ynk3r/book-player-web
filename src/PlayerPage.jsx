/**
 * allow updating the current time with the slider
 * unify setTime and setCurrentTime
 * playback speed indicator of speed
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useLiveQuery } from "dexie-react-hooks";
import _ from 'lodash';

import { Slider, IconButton, Toolbar, Box, Select, MenuItem, FormControl, CircularProgress } from '@mui/material';
import Menu from '@mui/material/Menu';
import Typography from '@mui/material/Typography';
import PlayIcon from '@mui/icons-material/PlayCircle';
import PauseIcon from '@mui/icons-material/PauseCircle';
import ReplayIcon from '@mui/icons-material/Replay10';
import ForwardIcon from '@mui/icons-material/Forward10';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SpeedIcon from '@mui/icons-material/Speed';

import db from './db';
import assert from './assert';
import { searchFilesAsync, getFileContentAsync, getFilePath } from './files';
import { getStorage, setStorage } from './storage';

// HtmlRenderer
const HtmlRenderer = ({ htmlContent }) => {
  return (
    <Typography variant="body1" gutterBottom
      dangerouslySetInnerHTML={{
        __html: htmlContent,
      }}

    />
  );
};

const getChapterAudioFileContentAsync = async (chapter) => {
  const chapterAudioFile = (await searchFilesAsync(f => getFilePath(f) === chapter.filePath))[0];
  assert(chapterAudioFile, `chapterAudioFile not found for path "${chapter.filePath}"`);
  await getFileContentAsync(chapterAudioFile);
}

const getBookId = (book) => book['-odread-buid'];
const getChapterId = (chapter) => chapter?.filePath;

const AudioPlayer = ({ book, back }) => {
  const [chapter, _setChapter] = useState();
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState();
  const [currentTime, setCurrentTime] = useState();
  const [anchorEl, setAnchorEl] = useState(null);
  const audioRef = useRef(null);

  const handleSettingsClick = (event) => setAnchorEl(event.currentTarget);
  const handleSettingsClose = () => setAnchorEl(null);

  // Init
  const setChapter = useCallback((chapter) => {
    setLoading(true);
    setTime(undefined);
    setCurrentTime(undefined);
    _setChapter(chapter);
  }, [_setChapter]);

  useEffect(() => {
    console.log('book changed!', { book })
    const chapterId = getStorage(getBookId(book))?.chapterId || getChapterId(book.nav.toc[0]);
    setChapter(book.nav.toc.find(c => getChapterId(c) === chapterId));
  }, [book]);

  useEffect(() => {
    console.log('chapter changed!', { chapter })
  }, [chapter])

  // Time
  // Chapter Start / End Times 
  useEffect(() => {
    if (loading) return;
    const chapterNext = book.nav.toc[book.nav.toc.indexOf(chapter) + 1];
    const start = chapter.offset;
    const end = chapterNext?.filePath === chapter.filePath
      ? chapterNext.offset : audioRef.current.duration;
    setTime({ start, end });
    setCurrentTime(audioRef.current.currentTime - start); // offset
  }, [loading, chapter, book]);

  // Get Audio File Content
  useEffect(() => {
    if (!chapter) return;
    getChapterAudioFileContentAsync(chapter);
  }, [chapter])

  // Get Audio File Content, Next
  useEffect(() => {
    if (!chapter || loading) return;
    const index = book.nav.toc.indexOf(chapter);
    const chapterNext = book.nav.toc[index + 1];
    if (!chapterNext) return;
    getChapterAudioFileContentAsync(chapter);
  }, [book, chapter])

  // Skip
  const skip = (amount) => {
    audioRef.current.currentTime += amount;
  };

  const handleTimeUpdate = useCallback(() => {
    if (!time) return;
    setCurrentTime(audioRef.current.currentTime - time.start); // offset
  }, [time]);

  const handlePlaybackRateChange = (playbackRate) => {
    localStorage.setItem("playbackRate", playbackRate);
    audioRef.current.playbackRate = playbackRate;
    handleSettingsClose();
  };

  // Load Audio File
  useLiveQuery(async () => {
    if (!chapter || !audioRef.current) return;
    const file = await db.files.where('path').equals(chapter.filePath).first();
    if (!file || !file.data) return;
    audioRef.current.src = window.URL.createObjectURL(new Blob([file.data], { type: 'audio/mpeg' }));
    audioRef.current.load();
    const { chapterId, currentTime } = getStorage(getBookId(book)) || {};
    console.log({ o: getChapterId(chapter), chapterId, currentTime })
    audioRef.current.currentTime = chapterId === getChapterId(chapter) ? currentTime : chapter.offset;
    audioRef.current.playbackRate = parseFloat(localStorage.getItem("playbackRate")) || 1;
  }, [book, chapter]);

  // Play / Pause
  useEffect(() => {
    if (!audioRef.current) return;
    if (!loading && playing) {
      audioRef.current.pause();
      audioRef.current.play();
    }
    else {
      audioRef.current.pause();
    }
  }, [loading, playing])

  // Update Chapter
  useEffect(() => {
    if (!book || !chapter || !time || !currentTime) return;
    setStorage(getBookId(book), { chapterId: getChapterId(chapter), currentTime });
    if (currentTime >= (time.end - time.start)) {
      const chapterNext = book.nav.toc[book.nav.toc.indexOf(chapter) + 1];
      if (chapterNext) setChapter(chapterNext);
    } else if (currentTime < 0) {
      const chapterPrev = book.nav.toc[book.nav.toc.indexOf(chapter) - 1];
      if (chapterPrev) setChapter(chapterPrev);
    }
  }, [book, chapter, time, currentTime]);


  const handleOnChange = (event, newValue) => {
    console.log('handleOnChange', { event, newValue });
  }

  const handleOnChangeCommitted = useCallback((event, newValue) => {
    console.log('handleOnChangeCommitted', { event, newValue });
    audioRef.current.currentTime = newValue + chapter.offset;
  }, [chapter]);

  const MainIcon = playing && !loading ? PauseIcon : PlayIcon;

  // console.log({ chapter, loading, time, currentTime, currentTime0: audioRef?.current?.currentTime });

  if (!chapter) return;

  return (
    <>
      <Toolbar>
        {/* Button on the left */}
        <IconButton edge="start" color="inherit" aria-label="back" onClick={back}>
          <ArrowBackIcon />
        </IconButton>

        {/* Title */}
        <Typography variant="h6" style={{ flexGrow: 1 }}>
        </Typography>

        {/* Button on the right */}
        <IconButton edge="end" color="inherit" aria-label="settings" onClick={handleSettingsClick}>
          <SpeedIcon />
        </IconButton>

        {/* Playback rate menu */}
        <Menu
          id="playback-rate-menu"
          anchorEl={anchorEl}
          keepMounted
          open={Boolean(anchorEl)}
          onClose={handleSettingsClose}
        >
          <MenuItem onClick={() => handlePlaybackRateChange(1)}>1x</MenuItem>
          <MenuItem onClick={() => handlePlaybackRateChange(1.1)}>1.1x</MenuItem>
          <MenuItem onClick={() => handlePlaybackRateChange(1.2)}>1.2x</MenuItem>
          <MenuItem onClick={() => handlePlaybackRateChange(1.5)}>1.5x</MenuItem>
          <MenuItem onClick={() => handlePlaybackRateChange(2)}>2x</MenuItem>
        </Menu>

      </Toolbar>


      <FormControl fullWidth>
        {/* Audio */}
        <audio
          style={{ display: 'none' }}
          ref={audioRef}
          onLoadedData={() => setLoading(false)}
          onTimeUpdate={handleTimeUpdate}
          onError={(e) => console.error('Error loading audio:', e)}
        />

        {/* Controls */}
        <div style={{ textAlign: 'center' }}>
          <IconButton onClick={() => skip(-10)} style={{ border: '2px solid', borderRadius: '50%' }}>
            <ReplayIcon style={{ fontSize: 40 }} />
          </IconButton>
          <IconButton onClick={() => setPlaying(!playing)} >
            <Box sx={{ m: 1, position: 'relative', display: 'inline-block' }}>
              <MainIcon style={{ fontSize: 100 }} />
              {playing && loading && (<CircularProgress
                size={100}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  zIndex: 1,
                }}
              />)}
            </Box>
          </IconButton>
          <IconButton onClick={() => skip(10)} style={{ border: '2px solid', borderRadius: '50%' }}>
            <ForwardIcon style={{ fontSize: 40 }} />
          </IconButton>
          {/* Progress slider */}
          <Slider
            value={currentTime || time?.start || 0}
            onChange={handleOnChange}
            onChangeCommitted={handleOnChangeCommitted}
            min={time?.start || 0}
            max={time?.end || 1}
            aria-labelledby="progress-slider"
            style={{ flexGrow: 1 }}
          />
        </div >
        <br />

        {/* Chapter Selection */}
        < Select
          onChange={(event) => setChapter(book.nav.toc[event.target.value])}
          value={book.nav.toc.indexOf(chapter)}
        >
          {
            book.nav.toc.map((chapter, index) => (
              <MenuItem key={index} value={index} >
                {chapter.title}
              </MenuItem>
            ))
          }
        </Select >

        {/* Book Info */}
        <br />
        <br />
        <Typography variant="h4" gutterBottom>
          Description
        </Typography>
        <HtmlRenderer htmlContent={book.description.full} />
      </FormControl >
    </>
  );
};

export default AudioPlayer;
