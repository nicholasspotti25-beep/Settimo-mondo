/**
 * Mounted family: a humanoid rider (bones prefixed 'rider_') on a quadruped steed (quadruped bone names).
 * The rider hangs from `rider_root` (child of root) which follows the `saddle` bone; with the actor flag 'dismounted'
 * the rider blends to its own rest transform (standing beside the steed), clips switch to the 'foot_' variants and the
 * steed fades away (hideOnFlag). Clip root offsets/rotation drive the steed's `body`.
 */
import type { ModelBuilder } from '../../kit/model';
import { humanoidSkeleton, type HumanoidDims, type HumanoidSkeletonOpts } from './humanoid';
import { quadrupedSkeleton, type QuadrupedDims, type QuadrupedOpts } from './quadruped';

export interface MountedOpts {
  horse: QuadrupedOpts;
  rider: Omit<HumanoidSkeletonOpts, 'prefix' | 'parent' | 'at'>;
  /** Saddle height above the barrel top (meters). */
  seat?: number;
}

export interface MountedDims {
  horse: QuadrupedDims;
  rider: HumanoidDims;
  saddleY: number;
}

export function mountedSkeleton(mb: ModelBuilder, o: MountedOpts): MountedDims {
  const q = quadrupedSkeleton(mb, { legStyle: 'equine', ...o.horse });
  const w = q.w;
  // saddle sits over the middle of the barrel (spine bone is mid-body)
  const seat = o.seat ?? w * 1.0;
  mb.bone('saddle', 'spine', [0, seat, -0.04 * q.L]);
  const saddleModel = mb.restPos('saddle');
  // rider_root rest = standing on the ground beside the steed (dismounted); mounted it follows the saddle
  mb.bone('rider_root', 'root', [w * 1.6 + 0.6, 0, saddleModel.z * 0.5]);
  const H = o.rider.height;
  const rider = humanoidSkeleton(mb, { ...o.rider, prefix: 'rider_', parent: 'rider_root' });
  // seat the hips on the saddle when mounted: rider hips rest is at standing height above rider_root, so the
  // follow puts rider_root at the saddle minus the standing hip height (clips bend the legs around the barrel)
  mb.bone('seat', 'saddle', [0, -rider.hipY + 0.06 * H, 0]);
  mb.info.family = 'mounted';
  mb.info.rootBone = 'body';
  mb.size = q.bodyY;
  mb.height = Math.max(mb.height, saddleModel.y + H * 0.95);
  mb.info.walkSpeed = 2.0 * (q.h / 1.6);
  mb.info.runSpeed = 7.0 * (q.h / 1.6);
  mb.info.look = [{ bone: 'rider_head', weight: 0.55, limit: 60 }, { bone: 'rider_neck', weight: 0.2, limit: 30 }, { bone: 'head', weight: 0.35, limit: 35 }];
  mb.info.flinch = ['rider_spine', 'rider_chest', 'spine'];
  mb.info.follow = [{ bone: 'rider_root', target: 'seat', off: 'dismounted' }];
  mb.info.hideOnFlag = { dismounted: ['body'] };
  mb.info.flagPrefix = { dismounted: 'foot_' };
  return { horse: q, rider, saddleY: saddleModel.y };
}
