import { FILE_CATEGORIES } from '../constants';

export const fmtSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

export const getFileCategory = (name) => {
  const ext = `.${name.split('.').pop().toLowerCase()}`;
  return FILE_CATEGORIES.find((category) => category.exts.includes(ext));
};

export const isImage = (name) => {
  const ext = `.${name.split('.').pop().toLowerCase()}`;
  return FILE_CATEGORIES[0].exts.includes(ext);
};
