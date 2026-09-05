export function canModifyResource(ownerId: string, actorId: string) {
  return ownerId === actorId;
}

