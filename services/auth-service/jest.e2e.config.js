module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: './tsconfig.test.json' }],
  },
  testEnvironment: 'node',
  modulePaths: ['<rootDir>/node_modules'],
  moduleNameMapper: {
    '^@nest-gateway/shared$': '<rootDir>/../../packages/shared/src',
  },
};
