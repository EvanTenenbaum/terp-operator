import { TRPCError } from '@trpc/server';
import { commandMinRole, type CommandName } from '../shared/commandCatalog';
import type { Role, SessionUser } from '../shared/types';

const roleRank: Record<Role, number> = {
  viewer: 0,
  operator: 1,
  manager: 2,
  owner: 3
};

export function canRole(role: Role, minimum: Role) {
  return roleRank[role] >= roleRank[minimum];
}

export function assertCommandAccess(user: SessionUser, commandName: CommandName) {
  const minimum = commandMinRole[commandName];
  if (!canRole(user.role, minimum)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `${commandName} requires ${minimum} access. Your role is ${user.role}.`
    });
  }
}

export function assertRole(user: SessionUser | null, minimum: Role) {
  if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please sign in first.' });
  if (!canRole(user.role, minimum)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `This action requires ${minimum} access.` });
  }
  return user;
}
