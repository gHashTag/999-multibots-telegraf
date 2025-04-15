module.exports = {
  extends: ['../../.eslintrc.js'],
  rules: {
    'no-restricted-globals': [
      'error',
      {
        name: 'jest',
        message: 'Please import from @/test-utils/core instead.'
      },
      {
        name: 'describe',
        message: 'Please import from @/test-utils/core instead.'
      },
      {
        name: 'it',
        message: 'Please import from @/test-utils/core instead.'
      },
      {
        name: 'test',
        message: 'Please import from @/test-utils/core instead.'
      },
      {
        name: 'expect',
        message: 'Please import from @/test-utils/core instead.'
      }
    ]
  }
} 