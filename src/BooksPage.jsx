import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from "dexie-react-hooks";
import _ from 'lodash';

import { Toolbar, IconButton, MenuItem, List, ListItem, ListItemText } from '@mui/material';
import Typography from '@mui/material/Typography';
import SettingsIcon from '@mui/icons-material/Settings';
import Menu from '@mui/material/Menu';

import db from './db';
import assert from './assert';
import useAsyncEffect from './useAsyncEffect'
import { searchFilesAsync, getFileContentAsync, getFileName, getFilePath, getFileShortName, getFileOffset } from './files'

export default ({ logout, selectBook }) => {
  assert(logout, 'logout is not defined');
  assert(selectBook, 'selectBook is not defined');

  const [anchorEl, setAnchorEl] = useState(null);

  const handleSettingsClick = (event) => setAnchorEl(event.currentTarget);
  const handleSettingsClose = () => setAnchorEl(null);

  // Load books, if needed
  useAsyncEffect(async () => {
    let bookFiles = await searchFilesAsync(file => file.name === 'openbook.json');
    console.log({ bookFiles });
    await Promise.all(bookFiles.map(f => getFileContentAsync(f, data => {
      const book = JSON.parse(data);
      const bookChildrenFiles = f.parent.children;
      const bookChildrenFilePaths = _.fromPairs(bookChildrenFiles.map(it => [
        getFileShortName(getFileName(it)),
        getFilePath(it)
      ]));
      book.nav.toc = book.nav.toc.map(t => ({
        ...t,
        filePath: bookChildrenFilePaths[getFileShortName(t.path)],
        offset: getFileOffset(t.path)
      }))
      return book;
    })));
  }, []);

  // Query books from files
  const books = useLiveQuery(async () => {
    const bookFiles = await db.files
      .where('type')
      .equals('json')
      .toArray();
    console.log({ bookFiles })
    const books = bookFiles.map(({ data, path }) => {
      return { ...data, path }
    });
    return books;
  }, [], []);

  return (
    <>
      <Toolbar>
        {/* Title */}
        <Typography variant="h6" style={{ flexGrow: 1 }}>
        </Typography>

        {/* Button on the right */}
        <IconButton edge="end" color="inherit" aria-label="logout" onClick={handleSettingsClick}>
          <SettingsIcon />
        </IconButton>

        {/* Settings menu */}
        <Menu
          id="settings-menu"
          anchorEl={anchorEl}
          keepMounted
          open={Boolean(anchorEl)}
          onClose={handleSettingsClose}
        >
          <MenuItem onClick={logout}>Logout</MenuItem>
        </Menu>
      </Toolbar>

      <Typography variant="h1">Books</Typography>
      <List>
        {books.map((book, index) => (
          <ListItem key={index} button onClick={() => selectBook(book)}>
            <ListItemText primary={book?.title?.main} />
          </ListItem>
        ))}
      </List>
    </>
  );
}