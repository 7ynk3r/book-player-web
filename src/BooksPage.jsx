import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from "dexie-react-hooks";
import _ from 'lodash';

import db from './db';
import assert from './assert';
import useAsyncEffect from './useAsyncEffect'
import { searchFilesAsync, getFileContentAsync, getFileName, getFilePath } from './files'

// "path": "{C27AB72C-AA23-4324-9BDC-65BEBAB5FEA5}Fmt425-Part01.mp3#4242"
const getFileShortName = (path) => path.split('-').slice(-1)[0].split('#')[0];
const getFileOffset = (path) => path.split('#')[1] || 0;

export default ({ logout, selectBook }) => {
  assert(logout, 'logout is not defined');
  assert(selectBook, 'selectBook is not defined');

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
      <a href="#" onClick={logout}>Logout</a>
      <br />
      <h1>Books</h1>
      <ul>
        {books.map((book, index) => (
          <li key={index}>
            <a href="#" onClick={(event) => selectBook(book)}>{book?.title?.main}</a>
          </li>
        ))}
      </ul>
    </>
  );
}