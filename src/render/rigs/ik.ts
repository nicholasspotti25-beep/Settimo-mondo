/**
 * Small IK helpers working on THREE.Bone hierarchies in world space (no allocation per call):
 *  - twoBoneIK: analytic limb solver (arms, legs) with a pole hint,
 *  - ccdIK: cyclic coordinate descent for chains (necks/heads following sim part anchors, tentacle tips),
 *  - aimBone: rotate a bone so its local axis points at a world target (look-at with angle limit).
 */
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qOrig = new THREE.Quaternion();
const _pole = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Set a bone's world rotation by pre-multiplying a world-space delta rotation, then refresh its subtree. */
export function rotateBoneWorld(bone: THREE.Object3D, delta: THREE.Quaternion, weight = 1): void {
  bone.getWorldQuaternion(_qw);
  if (weight < 1) _q.identity().slerp(delta, Math.max(0, weight));
  else _q.copy(delta);
  _qw.premultiply(_q);
  if (bone.parent) {
    bone.parent.getWorldQuaternion(_qp);
    _qp.invert();
    bone.quaternion.copy(_qp.multiply(_qw));
  } else bone.quaternion.copy(_qw);
  bone.updateMatrixWorld(true);
}

/**
 * Analytic two-bone IK. `upper` -> `lower` -> `end` (end = bone or socket whose world position is the effector).
 * The bend plane is chosen toward `pole` (world). `weight` blends with the current pose.
 */
export function twoBoneIK(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3 | null, weight = 1): void {
  if (weight <= 0) return;
  upper.updateMatrixWorld(true);
  upper.getWorldPosition(_a);
  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
  if (l1 < 1e-5 || l2 < 1e-5) return;
  _t.copy(target);
  const maxR = (l1 + l2) * 0.999;
  _d1.subVectors(_t, _a);
  let dist = _d1.length();
  if (dist > maxR) {
    _t.copy(_a).addScaledVector(_d1, maxR / dist);
    dist = maxR;
  }
  dist = Math.max(dist, Math.abs(l1 - l2) + 1e-4);
  // 1. bend the elbow: desired interior angle at the lower joint
  const cosB = THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - dist * dist) / (2 * l1 * l2), -1, 1);
  const desiredB = Math.acos(cosB);
  _d1.subVectors(_a, _b).normalize();
  _d2.subVectors(_c, _b).normalize();
  const curB = Math.acos(THREE.MathUtils.clamp(_d1.dot(_d2), -1, 1));
  // bend axis: the current bend plane (rotating d2 about d1 x d2 by +angle opens the joint); straight limbs use the pole
  _axis.crossVectors(_d1, _d2);
  if (_axis.lengthSq() < 1e-6) {
    if (pole) _pole.subVectors(pole, _b);
    else _pole.set(0, 0, 1);
    _axis.crossVectors(_d1, _pole);
    if (_axis.lengthSq() < 1e-8) _axis.set(1, 0, 0);
  }
  _axis.normalize();
  _qOrig.copy(lower.quaternion);
  _q.setFromAxisAngle(_axis, desiredB - curB);
  rotateBoneWorld(lower, _q, 1);
  // 2. swing the upper bone so the effector reaches the target
  end.getWorldPosition(_c);
  _d1.subVectors(_c, _a).normalize();
  _d2.subVectors(_t, _a).normalize();
  _q.setFromUnitVectors(_d1, _d2);
  rotateBoneWorld(upper, _q, 1);
  // 3. pole twist: rotate around the shoulder->target axis so the elbow faces the pole
  if (pole) {
    lower.getWorldPosition(_b);
    _n.subVectors(_t, _a).normalize();
    _d1.subVectors(_b, _a);
    _d1.addScaledVector(_n, -_d1.dot(_n));
    _pole.subVectors(pole, _a);
    _pole.addScaledVector(_n, -_pole.dot(_n));
    if (_d1.lengthSq() > 1e-8 && _pole.lengthSq() > 1e-8) {
      _d1.normalize();
      _pole.normalize();
      let ang = Math.acos(THREE.MathUtils.clamp(_d1.dot(_pole), -1, 1));
      _axis.crossVectors(_d1, _pole);
      if (_axis.dot(_n) < 0) ang = -ang;
      _q.setFromAxisAngle(_n, ang);
      rotateBoneWorld(upper, _q, 1);
    }
  }
  if (weight < 1) {
    // blend back toward the original pose (cheap approximation: lower joint only)
    lower.quaternion.slerp(_qOrig, 1 - weight);
    lower.updateMatrixWorld(true);
  }
}

/**
 * CCD IK: rotate the chain bones (root first .. tip last) so `effector` approaches `target`. `weight` scales every step.
 * `maxStep` limits rotation per bone per iteration (radians).
 */
export function ccdIK(chain: THREE.Object3D[], effector: THREE.Object3D, target: THREE.Vector3, iterations = 2, weight = 1, maxStep = 0.6): void {
  if (weight <= 0 || !chain.length) return;
  chain[0].updateMatrixWorld(true);
  for (let it = 0; it < iterations; it++) {
    for (let i = chain.length - 1; i >= 0; i--) {
      const b = chain[i];
      b.getWorldPosition(_a);
      effector.getWorldPosition(_c);
      _d1.subVectors(_c, _a);
      _d2.subVectors(target, _a);
      if (_d1.lengthSq() < 1e-10 || _d2.lengthSq() < 1e-10) continue;
      _d1.normalize();
      _d2.normalize();
      let ang = Math.acos(THREE.MathUtils.clamp(_d1.dot(_d2), -1, 1));
      if (ang < 1e-4) continue;
      ang = Math.min(ang, maxStep) * weight;
      _axis.crossVectors(_d1, _d2);
      if (_axis.lengthSq() < 1e-12) continue;
      _axis.normalize();
      _q.setFromAxisAngle(_axis, ang);
      rotateBoneWorld(b, _q, 1);
    }
  }
}

/**
 * Rotate `bone` so that its local `axis` (default +Z) turns toward `target` by `weight`, limited to `limit` radians.
 */
export function aimBone(bone: THREE.Object3D, target: THREE.Vector3, weight: number, limit: number, axis?: THREE.Vector3): void {
  if (weight <= 0) return;
  bone.getWorldPosition(_a);
  bone.getWorldQuaternion(_qw);
  _d1.copy(axis ?? _b.set(0, 0, 1)).applyQuaternion(_qw).normalize();
  _d2.subVectors(target, _a);
  if (_d2.lengthSq() < 1e-8) return;
  _d2.normalize();
  let ang = Math.acos(THREE.MathUtils.clamp(_d1.dot(_d2), -1, 1));
  if (ang < 1e-4) return;
  _axis.crossVectors(_d1, _d2);
  if (_axis.lengthSq() < 1e-12) return;
  _axis.normalize();
  ang = Math.min(ang, limit) * weight;
  _q.setFromAxisAngle(_axis, ang);
  rotateBoneWorld(bone, _q, 1);
}
