require('dotenv').config();
const store = require('./store');

store.ready
  .then(() => require('./index'))
  .catch(error => {
    console.error('Ironclad failed to initialize storage:', error);
    process.exitCode = 1;
  });
