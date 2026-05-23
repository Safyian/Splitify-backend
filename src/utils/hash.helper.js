import crypto from 'crypto';

export const hashContact = (value) => {
  if (!value) return null;
  return crypto
    .createHash('sha256')
    .update(value.toLowerCase().trim().replace(/\s+/g, ''))
    .digest('hex');
};
