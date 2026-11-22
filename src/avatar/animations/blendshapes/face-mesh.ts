type FaceMesh = {
  name: string;
  morphTargetDictionary?: Record<string, number>;
};

/**
 * The mesh that carries the face blend shapes: the configured one (`Wolf3D_Head`
 * in a Ready Player Me model with separate meshes) or else the one with a mouth
 * (`jawOpen`), such as `Wolf3D_Avatar` in a single-mesh model (T-09).
 */
export const pickFaceMesh = <T extends FaceMesh>(
  meshes: T[],
  configuredName?: string | string[],
): T | undefined =>
  meshes.find((m) => [configuredName].flat().includes(m.name)) ||
  meshes.find((m) => m.morphTargetDictionary?.jawOpen !== undefined);

const MOUTH = /^(jaw|mouth|cheek|tongue)/;

/** The blend shapes of the mouth (jaw, lips, cheeks, tongue), not eyes or brows. */
export const mouthOnly = <T extends { categoryName: string }>(
  shapes: T[],
): T[] => shapes.filter((s) => MOUTH.test(s.categoryName));
