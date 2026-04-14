const base = require('../jest.config.base.js');

module.exports = {
  ...base,
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.js'],
  collectCoverageFrom: ['<rootDir>/**/*.js', '!<rootDir>/**/*.test.js'],
};
