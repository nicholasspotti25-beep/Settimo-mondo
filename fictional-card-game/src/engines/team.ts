/**
 * Team Draft: two teams of five (Captain, Tank, Hax User, Planner, Support).
 * Score = Σ role value of each character in its assigned role + Special Effect contributions.
 *
 * Special Effects are deterministic: every condition is evaluated on the BASE state (role assignments and base totals),
 * and every impact is computed from base values, so effects never depend on each other or on evaluation order.
 * Each contribution is rounded to 2 decimals.
 */
import { round2 } from '../core/util';
import {
  ROLES, ROLE_LABEL, type EffectCondition, type EffectImpact, type PlayerId, type Role, type SpecialEffect, type TeamEntry,
} from '../model/types';

export type Team = Record<Role, TeamEntry>;

/** Snake draft order for 10 picks: A B B A A B B A A B (each player picks 5). */
export function draftOrder(first: PlayerId): PlayerId[] {
  const a = first, b: PlayerId = first === 'p1' ? 'p2' : 'p1';
  return [a, b, b, a, a, b, b, a, a, b];
}

export interface MemberScore {
  role: Role;
  entryId: string;
  name: string;
  value: number;
}

export interface EffectResult {
  owner: PlayerId;
  sourceId: string;
  sourceName: string;
  name: string;
  description: string;
  rule: string;
  active: boolean;
  /** Points added to the owner's team. */
  selfDelta: number;
  /** Points removed from the opponent's team (positive number). */
  enemyDelta: number;
  explanation: string;
}

export interface TeamScore {
  members: MemberScore[];
  base: number;
  effectBonus: number;
  penaltyTaken: number;
  total: number;
}

export interface TeamResult {
  p1: TeamScore;
  p2: TeamScore;
  effects: EffectResult[];
  winner: PlayerId | 'tie';
}

export function describeCondition(c: EffectCondition, nameOf: (id: string) => string): string {
  switch (c.type) {
    case 'always': return 'Always active';
    case 'role': return `When this character is assigned as ${ROLE_LABEL[c.role]}`;
    case 'allyPresent': return `When ${nameOf(c.entryId)} is on the same team`;
    case 'enemyPresent': return `When ${nameOf(c.entryId)} is on the opposing team`;
    case 'roleValueAtLeast': return `When this character's value in its assigned role is at least ${c.value}`;
    case 'underdog': return "When this team's base total is lower than the opponent's";
  }
}

export function describeImpact(i: EffectImpact): string {
  switch (i.type) {
    case 'flatSelf': return `+${i.amount} points to this team`;
    case 'percentSelf': return `+${i.percent}% of this character's role value to this team`;
    case 'percentRole': return `+${i.percent}% of this team's ${ROLE_LABEL[i.role]} value`;
    case 'percentTeam': return `+${i.percent}% of this team's base total`;
    case 'flatEnemy': return `−${i.amount} points to the opposing team`;
    case 'percentEnemy': return `−${i.percent}% of the opposing team's base total`;
  }
}

export function describeEffect(fx: SpecialEffect, nameOf: (id: string) => string): string {
  return `${describeCondition(fx.condition, nameOf)}: ${describeImpact(fx.impact)}.`;
}

function members(team: Team): MemberScore[] {
  return ROLES.map((role) => ({ role, entryId: team[role].id, name: team[role].name, value: team[role].roles[role] ?? 0 }));
}

const sum = (xs: readonly number[]): number => round2(xs.reduce((s, x) => s + x, 0));

export function scoreTeams(teams: Record<PlayerId, Team>): TeamResult {
  const m: Record<PlayerId, MemberScore[]> = { p1: members(teams.p1), p2: members(teams.p2) };
  const base: Record<PlayerId, number> = { p1: sum(m.p1.map((x) => x.value)), p2: sum(m.p2.map((x) => x.value)) };
  const nameOf = (id: string): string => {
    for (const p of ['p1', 'p2'] as const) for (const r of ROLES) if (teams[p][r].id === id) return teams[p][r].name;
    return 'a specific character';
  };
  const effects: EffectResult[] = [];
  for (const owner of ['p1', 'p2'] as const) {
    const enemy: PlayerId = owner === 'p1' ? 'p2' : 'p1';
    for (const role of ROLES) {
      const ch = teams[owner][role];
      const fx = ch.effect;
      if (!fx) continue;
      const own = ch.roles[role] ?? 0;
      const c = fx.condition;
      let active: boolean;
      switch (c.type) {
        case 'always': active = true; break;
        case 'role': active = c.role === role; break;
        case 'allyPresent': active = ROLES.some((r) => teams[owner][r].id === c.entryId && teams[owner][r].id !== ch.id); break;
        case 'enemyPresent': active = ROLES.some((r) => teams[enemy][r].id === c.entryId); break;
        case 'roleValueAtLeast': active = own >= c.value; break;
        case 'underdog': active = base[owner] < base[enemy]; break;
      }
      let selfDelta = 0, enemyDelta = 0, explanation = 'Condition not met — no effect.';
      if (active) {
        const i = fx.impact;
        switch (i.type) {
          case 'flatSelf': selfDelta = round2(i.amount); explanation = `+${selfDelta} to ${owner.toUpperCase()}`; break;
          case 'percentSelf': selfDelta = round2((own * i.percent) / 100); explanation = `${i.percent}% of ${own} = +${selfDelta}`; break;
          case 'percentRole': {
            const rv = teams[owner][i.role].roles[i.role] ?? 0;
            selfDelta = round2((rv * i.percent) / 100);
            explanation = `${i.percent}% of ${ROLE_LABEL[i.role]} value ${rv} = +${selfDelta}`;
            break;
          }
          case 'percentTeam': selfDelta = round2((base[owner] * i.percent) / 100); explanation = `${i.percent}% of base total ${base[owner]} = +${selfDelta}`; break;
          case 'flatEnemy': enemyDelta = round2(i.amount); explanation = `−${enemyDelta} to ${enemy.toUpperCase()}`; break;
          case 'percentEnemy': enemyDelta = round2((base[enemy] * i.percent) / 100); explanation = `${i.percent}% of opponent base total ${base[enemy]} = −${enemyDelta}`; break;
        }
      }
      effects.push({
        owner, sourceId: ch.id, sourceName: ch.name, name: fx.name, description: fx.description,
        rule: describeEffect(fx, nameOf), active, selfDelta, enemyDelta, explanation,
      });
    }
  }
  const score = (p: PlayerId): TeamScore => {
    const enemy: PlayerId = p === 'p1' ? 'p2' : 'p1';
    const effectBonus = sum(effects.filter((e) => e.owner === p).map((e) => e.selfDelta));
    const penaltyTaken = sum(effects.filter((e) => e.owner === enemy).map((e) => e.enemyDelta));
    return { members: m[p], base: base[p], effectBonus, penaltyTaken, total: round2(base[p] + effectBonus - penaltyTaken) };
  };
  const p1 = score('p1'), p2 = score('p2');
  return { p1, p2, effects, winner: p1.total > p2.total ? 'p1' : p2.total > p1.total ? 'p2' : 'tie' };
}
