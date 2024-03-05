export const getTypedKeys = <T = string>(
  object: Record<string, any> | undefined,
): T[] => (object ? Object.keys(object) : []) as T[];
