import { pickFaceMesh } from './face-mesh.js';

const mesh = (name: string, targets: string[]) => ({
  name,
  morphTargetDictionary: Object.fromEntries(targets.map((t, i) => [t, i])),
});

describe('pickFaceMesh', () => {
  it('takes the configured mesh (RPM with separate meshes)', () => {
    const head = mesh('Wolf3D_Head', ['jawOpen', 'viseme_aa']);
    const teeth = mesh('Wolf3D_Teeth', ['jawOpen']);
    expect(pickFaceMesh([teeth, head], 'Wolf3D_Head')).toBe(head);
  });

  // T-09: a single-mesh avatar has no Wolf3D_Head; its mouth never moved
  it('falls back to the mesh with a mouth', () => {
    const eyes = mesh('EyeLeft', ['eyeBlinkLeft']);
    const avatar = mesh('Wolf3D_Avatar', ['eyeBlinkLeft', 'jawOpen']);
    expect(pickFaceMesh([eyes, avatar], 'Wolf3D_Head')).toBe(avatar);
  });

  it('finds nothing without blend shapes for a mouth', () => {
    expect(
      pickFaceMesh([mesh('Body', ['bellyIn'])], 'Wolf3D_Head'),
    ).toBeUndefined();
  });
});
