/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  testEnvironment: "node",
  testTimeout: 120_000,
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+.ts$": ["ts-jest", { useESM: true }],
  },
  moduleNameMapper: {
    '^~/(.*)$': '<rootDir>/src/$1',
  },
};
