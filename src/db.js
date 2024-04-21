import Dexie from 'dexie';

const db = new Dexie('AudioDB');

// Define the database schema
db.version(1).stores({
  files: 'path, name, type'
});

export default db;