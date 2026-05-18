export class EmailAlreadyTakenError extends Error {
  constructor() {
    super('Email already registered');
    this.name = 'EmailAlreadyTakenError';
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid credentials');
    this.name = 'InvalidCredentialsError';
  }
}

export class InvalidRefreshTokenError extends Error {
  constructor() {
    super('Invalid refresh token');
    this.name = 'InvalidRefreshTokenError';
  }
}

export class RefreshTokenRevokedError extends Error {
  constructor() {
    super('Refresh token revoked');
    this.name = 'RefreshTokenRevokedError';
  }
}
