module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.integration-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.test.json' }],
  },
  testEnvironment: 'node',
  testTimeout: 120000,
  maxWorkers: 1,
  modulePaths: ['<rootDir>/../node_modules'],
  moduleNameMapper: {
    '^@nest-gateway/shared$': '<rootDir>/../../../packages/shared/src',
    '^@nest-gateway/kafka$': '<rootDir>/../../../packages/kafka/src',
  },
};
