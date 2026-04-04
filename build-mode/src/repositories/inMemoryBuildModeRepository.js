export class InMemoryBuildModeRepository {
  constructor({ userProfiles = [], userRoutines = [], matches = [] } = {}) {
    this.userProfiles = [...userProfiles];
    this.userRoutines = [...userRoutines];
    this.matches = [...matches];
  }

  async getUserProfile(userId) {
    return this.userProfiles.find((profile) => profile.id === userId) || null;
  }

  async listCandidateRoutinesForSymmetry({ creatorId, activityType }) {
    return this.userRoutines.filter((routine) => {
      if (routine.userId === creatorId) {
        return false;
      }

      const hasTagMatch = Array.isArray(routine.routineTags) && routine.routineTags.includes(activityType);
      const hasHistoryMatch =
        Array.isArray(routine.activityHistory) &&
        routine.activityHistory.some((item) => item?.type === activityType);

      return routine.type === activityType || hasTagMatch || hasHistoryMatch;
    });
  }

  async listCandidateRoutinesForProximity({ creatorId }) {
    return this.userRoutines.filter((routine) => routine.userId !== creatorId && routine.locationCoords);
  }

  async getRecipientProfiles(recipientIds) {
    const idSet = new Set(recipientIds);
    return this.userProfiles.filter((profile) => idSet.has(profile.id));
  }

  async saveMatches(matches) {
    this.matches.push(...matches);
    return matches;
  }
}
