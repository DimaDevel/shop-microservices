module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.test.json' }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  modulePaths: ['<rootDir>/../node_modules'],
  moduleNameMapper: {
    '^@nest-gateway/shared$': '<rootDir>/../../../packages/shared/src',
    '^@nest-gateway/kafka$': '<rootDir>/../../../packages/kafka/src',
  },
};
