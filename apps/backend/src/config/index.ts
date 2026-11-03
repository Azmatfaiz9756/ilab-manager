import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'default_jwt_secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'default_jwt_refresh_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '90d',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
};
