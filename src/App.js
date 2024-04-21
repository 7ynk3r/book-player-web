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

// Fonts
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

import LoginPage from './LoginPage';
import BooksPage from './BooksPage';
import PlayerPage from './PlayerPage';

import db from './db';
import { init } from './files'

function App() {
  const [{ loading, storage, error, valid }, setStorageState] = useState({});
  const [selectedBook, setSelectedBook] = useState();

  const validateCredentials = useCallback(async (credsNew) => {
    const credsOld = JSON.parse(localStorage.getItem('creds'));
    if (credsOld && credsNew && credsNew.restore) {
      credsNew = credsOld;
    }
    if (!credsNew) {
      if (credsOld) {
        localStorage.clear();
        await db.delete();
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

  // Restore last session
  useEffect(() => { validateCredentials({ restore: true }) }, []);

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

}

export default App;
