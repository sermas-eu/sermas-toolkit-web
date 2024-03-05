export const addGlobal = (key: string, value: unknown) => {
  window.SERMAS = window.SERMAS || {};
  window.SERMAS[key] = value;
};
