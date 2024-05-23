const globals: any = {};

export const addGlobal = (key: string, value: unknown) => {
  globals[key] = value;

  // check if it's in DOM env
  try {
    if (typeof window !== undefined) {
      window.SERMAS = globals;
    }
  } catch {}
};
