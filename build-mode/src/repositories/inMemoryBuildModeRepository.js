export class InMemoryBuildModeRepository {
  constructor({
    userProfiles = [],
    userRoutines = [],
    routineLogs = [],
    activeIntentions = [],
    matches = [],
    blueprints = [],
    notifications = []
  } = {}) {
    this.userProfiles = [...userProfiles];
    this.userRoutines = [...userRoutines];
    this.routineLogs = [...routineLogs];
    this.activeIntentions = [...activeIntentions];
    this.matches = [...matches];
    this.blueprints = [...blueprints];
    this.notifications = [...notifications];
  }

  async getUserProfile(userId) {
    return this.userProfiles.find((profile) => profile.id === userId) || null;
  }

  async listBuildModeCandidateRoutines({ creatorId }) {
    return this.userRoutines.filter((routine) => routine.userId !== creatorId);
  }

  async listCandidateRoutinesForSymmetry({ creatorId, activityType }) {
    return this.userRoutines.filter((routine) => {
      if (routine.userId === creatorId) {
        return false;
      }

      if (!activityType) {
        return true;
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

  async getRoutineLogsForUser(userId) {
    return this.routineLogs.filter((log) => log.userId === userId);
  }

  async getRoutineLogsForUsers(userIds) {
    const idSet = new Set(userIds);
    const logsByUserId = new Map();

    for (const log of this.routineLogs) {
      if (!idSet.has(log.userId)) {
        continue;
      }

      const current = logsByUserId.get(log.userId) || [];
      current.push(log);
      logsByUserId.set(log.userId, current);
    }

    return logsByUserId;
  }

  async listActiveIntentions() {
    return [...this.activeIntentions];
  }

  async getActiveIntention(intentionId) {
    return this.activeIntentions.find((item) => item.id === intentionId) || null;
  }

  async saveActiveIntention(activeIntention) {
    const existingIndex = this.activeIntentions.findIndex((item) => item.id === activeIntention.id);

    if (existingIndex >= 0) {
      this.activeIntentions.splice(existingIndex, 1, activeIntention);
    } else {
      this.activeIntentions.push(activeIntention);
    }

    return activeIntention;
  }

  async saveMatches(matches) {
    this.matches.push(...matches);
    return matches;
  }

  async saveBlueprint(blueprint) {
    this.blueprints.push(blueprint);
    return blueprint;
  }

  async saveNotifications(notifications) {
    this.notifications.push(...notifications);
    return notifications;
  }
}
