import slugify from 'slugify';
import { randomBytes } from 'crypto';

export const generateSlug = (title: string): string => {
  const slug = slugify(title, { lower: true, strict: true });
  return slug;
};

export const generateRadomString = (length = 5): string => {
  return randomBytes(length).toString('base64url').substring(0, length);
};
