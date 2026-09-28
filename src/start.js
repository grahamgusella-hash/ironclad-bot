require('dotenv').config();
const store = require('./store');

console.log(`Ironclad Discord application ID: ${process.env.CLIENT_ID || 'not set'}`);

store.ready
  .then(() => require('./index'))
  .catch(error => {
    console.error('Ironclad failed to initialize storage:', error);
    process.exitCode = 1;
  });
